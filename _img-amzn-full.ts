import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env" });
const DSN = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
const sql = postgres(DSN, { ssl: "require", max: 2, prepare: false });
const r = await sql`
  SELECT pi.id, pi.product_id, pi.url, pi.is_primary, p.name AS product_name, p.slug
  FROM ecom_vit_product_image pi
  JOIN ecom_vit_product p ON p.id = pi.product_id
  WHERE pi.deleted_at IS NULL AND pi.url LIKE '%m.media-amazon.com%'
  ORDER BY pi.product_id, pi.is_primary DESC
`;
console.log(JSON.stringify(r, null, 2));
await sql.end({ timeout: 5 });
