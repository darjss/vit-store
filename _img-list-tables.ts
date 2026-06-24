import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env" });
const DSN = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
const sql = postgres(DSN, { ssl: "require", max: 2, prepare: false });
const r = await sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%image%' OR table_name ILIKE '%product%' ORDER BY table_schema, table_name`;
console.log(r);
await sql.end({ timeout: 5 });
