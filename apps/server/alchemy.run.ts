import path from "node:path";
import alchemy from "alchemy";
import {
  Hyperdrive,
  Images,
  KVNamespace,
  R2Bucket,
  RateLimit,
  Worker,
} from "alchemy/cloudflare";

const app = await alchemy("server");
const stage = app.stage;
console.log("cors origin", process.env.CORS_ORIGIN);

function buildDirectDbUrlFromPlanetscaleEnv() {
  const host = process.env.PLANETSCALE_HOST || "";
  const user = process.env.PLANETSCALE_USER || "";
  const password = process.env.PLANETSCALE_PASSWORD || "";
  const database = process.env.PLANETSCALE_DATABASE || "";

  const hasAll = Boolean(host && user && password && database);
  if (!hasAll) return { url: "", source: "missing_planetscale_env" as const, host, database };

  const hostWithPort = host.includes(":") ? host : `${host}:5432`;
  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@${hostWithPort}/${encodeURIComponent(database)}?sslmode=require`;
  return { url, source: "planetscale_env" as const, host, database };
}

const directDb = (() => {
  if (process.env.DIRECT_DB_URL) {
    return {
      url: String(process.env.DIRECT_DB_URL),
      source: "direct_db_url_env" as const,
      host: "",
      database: "",
    };
  }
  return buildDirectDbUrlFromPlanetscaleEnv();
})();

const kv = await KVNamespace("kv", {
  title: `vit-kv-${app.stage}`,
  adopt: true,
});

const r2 = await R2Bucket("r2", {
  name: "vit-store-bucket-prod",
  dev: {
    remote: true,
  },
  adopt: true,
});

const rateLimit = RateLimit({
  namespace_id: 1001,
  simple: {
    limit: 500,
    period: 60,
  },
});

const images = Images({
  dev: {
    remote: true,
  },
});

const hyperdriveDB = await Hyperdrive("pscale-db", {
  origin: {
    host: process.env.PLANETSCALE_HOST || "",
    user: process.env.PLANETSCALE_USER || "",
    password: process.env.PLANETSCALE_PASSWORD || "",
    database: process.env.PLANETSCALE_DATABASE || "",
  },
  adopt:true
});

export const server = await Worker("api", {
  entrypoint: path.join(import.meta.dirname, "src", "index.ts"),
  compatibility: "node",
  domains: stage === "prod" ? ["api.amerikvitamin.mn"] : undefined,

  adopt: true,
  bindings: {
    RATE_LIMITER: rateLimit,
    DB: hyperdriveDB,
    DIRECT_DB_URL: directDb.url,
    vitStoreKV: kv,
    r2Bucket: r2,
    images: images,
    CORS_ORIGIN: process.env.CORS_ORIGIN || "",
    DASH_URL: process.env.DASH_URL || "",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || "",
    DOMAIN: process.env.DOMAIN || "",
    MESSENGER_ACCESS_TOKEN: process.env.MESSENGER_ACCESS_TOKEN || "",
    MESSENGER_VERIFY_TOKEN: process.env.MESSENGER_VERIFY_TOKEN || "",
    SMS_GATEWAY_LOGIN: process.env.SMS_GATEWAY_LOGIN || "",
    SMS_GATEWAY_PASSWORD: process.env.SMS_GATEWAY_PASSWORD || "",
  },

  observability: {
    enabled: false,
    logs: {
      enabled: true,
      persist: true,
    },
    traces: {
      enabled: true,
      persist: true,
    },
  },
  placement: {
    mode: "smart",
  },
  dev: {
    port: 3006,
  },
});

console.log(`Server -> ${server.url}`);

await app.finalize();
