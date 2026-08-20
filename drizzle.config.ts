import type { Config } from "drizzle-kit";

/**
 * Only for `db:studio` / `db:push` during development. The application itself
 * creates its tables at boot (see `ensureSchema` in lib/db/index.ts), so this
 * file is never on the deployment path.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.MYSQL_HOST ?? "127.0.0.1",
        port: Number(process.env.MYSQL_PORT ?? 3306),
        user: process.env.MYSQL_USER ?? "root",
        password: process.env.MYSQL_PASSWORD ?? "",
        database: process.env.MYSQL_DATABASE ?? "leadcrm",
      },
} satisfies Config;
