/**
 * Phase 2 data migration: export Planetscale Postgres → D1 (SQLite) SQL dump.
 *
 * Reads every `ecom_vit_*` table from the live Planetscale Postgres database
 * (read-only) and emits a single `wrangler d1 import`-ready `.sql` file with the
 * Postgres → SQLite value transforms the D1 schema expects:
 *   - boolean            → 0 / 1
 *   - timestamp / date   → epoch SECONDS integer (drizzle `mode: "timestamp"`)
 *   - json / jsonb       → JSON text
 *   - everything else    → passed through (ids preserved verbatim)
 *
 * Tables are dumped in FK-dependency order and `sqlite_sequence` is reset per
 * table so future AUTOINCREMENT inserts don't collide with imported ids.
 *
 * This is READ-ONLY against Planetscale. It writes nothing to prod and does not
 * touch D1 — it only produces `out/d1-data.sql` + `out/row-counts.json`.
 *
 * Usage:
 *   bun run scripts/migrate-d1/export-planetscale-to-d1.ts
 *   # then load into staging D1 (Phase 2b), e.g.:
 *   #   wrangler d1 execute vit-d1-staging --remote \
 *   #     --file scripts/migrate-d1/out/d1-data.sql
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Tables in FK-dependency order (parents before children). The `ecom_vit_`
// prefix matches `sqliteTableCreator`/`pgTableCreator` in schema.ts.
const TABLES = [
	"ecom_vit_user",
	"ecom_vit_customer",
	"ecom_vit_brand",
	"ecom_vit_category",
	"ecom_vit_product",
	"ecom_vit_product_image",
	"ecom_vit_order",
	"ecom_vit_order_detail",
	"ecom_vit_payment",
	"ecom_vit_messenger_notification_failure",
	"ecom_vit_cart",
	"ecom_vit_cart_item",
	"ecom_vit_sales",
	"ecom_vit_purchase",
	"ecom_vit_purchase_item",
	"ecom_vit_purchase_receipt",
	"ecom_vit_purchase_receipt_item",
] as const;

// Columns that map to a `text({ mode: "json" })` column in the D1 schema and
// must therefore always contain valid JSON text (drizzle `JSON.parse`s them on
// read). In Planetscale `tags` is a plain `text` column that historically holds
// a JSON-array string but has some empty-string ("") rows; the jsonb columns
// arrive already parsed. Both are normalized to valid JSON below.
const JSON_TARGET_COLUMNS = new Set<string>([
	"ecom_vit_product.tags",
	"ecom_vit_product.ingredients",
	"ecom_vit_product.old_slugs",
	"ecom_vit_messenger_notification_failure.payload",
]);

// Rows per multi-row INSERT. `wrangler d1 import` runs raw SQL (not bound
// params), so the ~100 bound-param limit does not apply here; this only keeps
// individual statements a reasonable size.
const ROWS_PER_INSERT = 200;

// Upper bound on the character length of a single multi-row INSERT statement.
// D1 rejects oversized statements with SQLITE_TOOBIG (~100KB limit); product
// rows carry large (multi-KB) descriptions, so batches are flushed before
// crossing this budget.
const MAX_INSERT_CHARS = 60_000;

// A single row whose text value exceeds this is inserted with an empty
// placeholder and then appended in chunks via `UPDATE ... col = col || '...'`,
// because even a one-row INSERT of a huge literal would blow the statement
// limit (one product description is ~117KB). Kept well under the limit even
// after single-quote escaping doubles some characters.
const MAX_CELL_CHARS = 40_000;

let jsonNormalizations = 0;

const OUT_DIR = path.join(import.meta.dirname, "out");
const SQL_OUT = path.join(OUT_DIR, "d1-data.sql");
const COUNTS_OUT = path.join(OUT_DIR, "row-counts.json");

type ColumnMeta = { name: string; dataType: string };
type Row = Record<string, unknown>;

function parseEnvFile(filePath: string): Map<string, string> {
	const parsed = new Map<string, string>();
	for (const line of readFileSync(filePath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		parsed.set(key, value);
	}
	return parsed;
}

function loadPlanetscaleEnv(): {
	host: string;
	user: string;
	password: string;
	database: string;
} {
	const fromProcess = {
		host: process.env.PLANETSCALE_HOST,
		user: process.env.PLANETSCALE_USER,
		password: process.env.PLANETSCALE_PASSWORD,
		database: process.env.PLANETSCALE_DATABASE,
	};
	if (
		fromProcess.host &&
		fromProcess.user &&
		fromProcess.password &&
		fromProcess.database
	) {
		return fromProcess as Required<typeof fromProcess>;
	}

	// Fall back to parsing .env.prod at the repo root (gitignored).
	const envPath = path.join(import.meta.dirname, "..", "..", ".env.prod");
	if (!existsSync(envPath)) {
		throw new Error(
			`Missing Planetscale credentials. Set PLANETSCALE_HOST/USER/PASSWORD/DATABASE or provide ${envPath}`,
		);
	}
	const parsed = parseEnvFile(envPath);
	const host = parsed.get("PLANETSCALE_HOST");
	const user = parsed.get("PLANETSCALE_USER");
	const password = parsed.get("PLANETSCALE_PASSWORD");
	const database = parsed.get("PLANETSCALE_DATABASE");
	if (!host || !user || !password || !database) {
		throw new Error(
			`Incomplete Planetscale credentials in ${envPath} (need PLANETSCALE_HOST/USER/PASSWORD/DATABASE)`,
		);
	}
	return { host, user, password, database };
}

/** Escape a JS string as a SQLite single-quoted literal. */
function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

interface BuiltRow {
	/** The single-row VALUES tuple, with oversized cells emitted empty. */
	tuple: string;
	/** Chunked `UPDATE ... col = col || '...'` statements to run after INSERT. */
	appends: string[];
}

/**
 * Build a row's VALUES tuple. Any string cell longer than MAX_CELL_CHARS is
 * inserted as an empty literal and its real value is appended in chunks via
 * follow-up UPDATE statements, keeping every statement under D1's size limit.
 */
function buildRowTuple(
	table: string,
	meta: ColumnMeta[],
	row: Record<string, unknown>,
): BuiltRow {
	const appends: string[] = [];
	const id = row.id;
	const values = meta.map((col) => {
		const raw = row[col.name];
		if (typeof raw === "string" && raw.length > MAX_CELL_CHARS) {
			if (id === undefined || id === null) {
				throw new Error(
					`Oversized cell ${table}.${col.name} on a row without an id; cannot chunk.`,
				);
			}
			for (let i = 0; i < raw.length; i += MAX_CELL_CHARS) {
				const piece = raw.slice(i, i + MAX_CELL_CHARS);
				appends.push(
					`UPDATE "${table}" SET "${col.name}" = "${col.name}" || ${sqlString(piece)} WHERE "id" = ${id};`,
				);
			}
			return "''";
		}
		return formatValue(raw, col.dataType, `${table}.${col.name}`);
	});
	return { tuple: `(${values.join(", ")})`, appends };
}

/** Convert a Postgres timestamp/date value to epoch SECONDS. */
function toEpochSeconds(value: unknown): number {
	const date =
		value instanceof Date ? value : new Date(value as string | number);
	return Math.floor(date.getTime() / 1000);
}

/**
 * Coerce any source value for a JSON-target column into valid JSON text.
 *
 * jsonb columns (`ingredients`, `old_slugs`, `payload`) arrive already parsed
 * from postgres-js. The `tags` column is plain Postgres `text` and its data is
 * inconsistent: ~54% are clean array strings (`["a"]`), ~18% are DOUBLE
 * JSON-encoded (`"[\"a\"]"` — a JSON string wrapping the array string), and
 * ~28% are empty strings. We unwrap nested JSON-string layers until we reach a
 * non-string (the real array/object), and fall back to `[]` for empty/
 * unparseable values, so the D1 `text({ mode: "json" })` column always holds a
 * clean, parseable value at read time.
 */
function formatJsonColumn(value: unknown): string {
	let current = value;
	if (current === null || current === undefined) {
		jsonNormalizations++;
		current = [];
	}
	// Unwrap up to a few layers of JSON-string encoding (capped to avoid loops).
	for (let i = 0; i < 5 && typeof current === "string"; i++) {
		const trimmed = current.trim();
		if (trimmed === "") {
			jsonNormalizations++;
			current = [];
			break;
		}
		try {
			current = JSON.parse(trimmed);
			if (i > 0) jsonNormalizations++;
		} catch {
			jsonNormalizations++;
			current = [];
			break;
		}
	}
	return sqlString(JSON.stringify(current));
}

const TIMESTAMP_TYPES = new Set([
	"timestamp without time zone",
	"timestamp with time zone",
	"date",
]);
const NUMERIC_TYPES = new Set([
	"smallint",
	"integer",
	"bigint",
	"numeric",
	"real",
	"double precision",
]);

function formatNumeric(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number") return String(value);
	// numeric can arrive as a string; keep it verbatim if numeric-looking.
	return /^-?\d+(\.\d+)?$/.test(String(value))
		? String(value)
		: sqlString(String(value));
}

function formatValue(
	value: unknown,
	dataType: string,
	qualifiedColumn: string,
): string {
	if (JSON_TARGET_COLUMNS.has(qualifiedColumn)) {
		return formatJsonColumn(value);
	}
	if (value === null || value === undefined) return "NULL";
	if (dataType === "boolean") return value ? "1" : "0";
	if (TIMESTAMP_TYPES.has(dataType)) return String(toEpochSeconds(value));
	// postgres-js parses json columns into JS values.
	if (dataType === "json" || dataType === "jsonb") {
		return sqlString(JSON.stringify(value));
	}
	if (NUMERIC_TYPES.has(dataType)) return formatNumeric(value);
	if (value instanceof Date) return String(toEpochSeconds(value));
	if (typeof value === "object") return sqlString(JSON.stringify(value));
	return sqlString(String(value));
}

async function queryTableColumns(
	sql: postgres.Sql,
	table: string,
): Promise<ColumnMeta[]> {
	const columns = (await sql`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ${table}
                ORDER BY ordinal_position
        `) as unknown as Array<{ column_name: string; data_type: string }>;

	if (columns.length === 0) {
		throw new Error(
			`Table ${table} not found in Planetscale (no columns). Aborting.`,
		);
	}

	return columns.map((column) => ({
		name: column.column_name,
		dataType: column.data_type,
	}));
}

async function queryTableRows(
	sql: postgres.Sql,
	table: string,
): Promise<Row[]> {
	return (await sql`
                SELECT * FROM ${sql(table)} ORDER BY 1
        `) as unknown as Row[];
}

function emitInsertBatch(
	parts: string[],
	table: string,
	columnList: string,
	batch: string[],
) {
	if (batch.length === 0) return;
	parts.push(`INSERT INTO "${table}" (${columnList}) VALUES
${batch.join(",\n")};`);
}

function emitTableDump(
	parts: string[],
	table: string,
	meta: ColumnMeta[],
	rows: Row[],
) {
	const columnList = meta.map((column) => `"${column.name}"`).join(", ");
	parts.push(`-- ${table}: ${rows.length} rows`);

	let batch: string[] = [];
	let batchChars = 0;
	const flush = () => {
		emitInsertBatch(parts, table, columnList, batch);
		batch = [];
		batchChars = 0;
	};

	for (const row of rows) {
		const built = buildRowTuple(table, meta, row);
		const tuple = built.tuple;
		if (
			batch.length > 0 &&
			(batch.length >= ROWS_PER_INSERT ||
				batchChars + tuple.length > MAX_INSERT_CHARS)
		) {
			flush();
		}
		batch.push(tuple);
		batchChars += tuple.length + 2;
		if (built.appends.length > 0) {
			flush();
			parts.push(...built.appends);
		}
	}

	flush();

	if (rows.length > 0 && meta.some((column) => column.name === "id")) {
		parts.push(
			`DELETE FROM sqlite_sequence WHERE name = ${sqlString(table)};`,
			`INSERT INTO sqlite_sequence (name, seq) VALUES (${sqlString(table)}, (SELECT MAX("id") FROM "${table}"));`,
		);
	}
	parts.push("");
}

async function dumpAllTables(
	sql: postgres.Sql,
	parts: string[],
	counts: Record<string, number>,
) {
	for (const table of TABLES) {
		const meta = await queryTableColumns(sql, table);
		const rows = await queryTableRows(sql, table);
		counts[table] = rows.length;
		emitTableDump(parts, table, meta, rows);
	}
}

async function main() {
	const creds = loadPlanetscaleEnv();
	const sql = postgres({
		host: creds.host,
		username: creds.user,
		password: creds.password,
		database: creds.database,
		port: 5432,
		ssl: "require",
		max: 1,
		fetch_types: false,
	});

	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

	const parts: string[] = [];
	const counts: Record<string, number> = {};

	parts.push("-- Generated by scripts/migrate-d1/export-planetscale-to-d1.ts");
	parts.push(`-- Source: Planetscale Postgres (${creds.database})`);
	parts.push(`-- Generated at: ${new Date().toISOString()}`);
	parts.push("PRAGMA defer_foreign_keys = ON;");
	parts.push("");
	parts.push("-- Reset: clear all tables so this dump can be re-run safely");
	for (const table of [...TABLES].reverse()) {
		parts.push(`DELETE FROM "${table}";`);
	}
	parts.push("");

	try {
		await dumpAllTables(sql, parts, counts);
	} finally {
		await sql.end({ timeout: 5 });
	}

	writeFileSync(
		SQL_OUT,
		`${parts.join("\n")}
`,
		"utf8",
	);
	writeFileSync(
		COUNTS_OUT,
		`${JSON.stringify(counts, null, 2)}
`,
		"utf8",
	);

	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	console.log(`Wrote ${SQL_OUT}`);
	console.log(`Wrote ${COUNTS_OUT}`);
	console.log(`Total rows across ${TABLES.length} tables: ${total}`);
	console.log(`JSON columns normalized to valid JSON: ${jsonNormalizations}`);
	for (const table of TABLES) {
		console.log(`  ${table}: ${counts[table] ?? 0}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
