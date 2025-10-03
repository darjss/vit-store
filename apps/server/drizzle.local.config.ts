// drizzle-local.config.ts
import type { Config } from 'drizzle-kit';


export default {
  schema: './src/db/schema.ts', // Or wherever your schema is
  out: './drizzle/local',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/f26dd3b4af2b86035a68fbb491403d4b54d63dee4c1e42d18d4ad58dc6978866.sqlite', // Local path
  },
} satisfies Config;