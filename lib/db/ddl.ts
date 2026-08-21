import { is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "./schema";

/**
 * Works out which columns the schema declares but the database does not have.
 *
 * `CREATE TABLE IF NOT EXISTS` covers a brand-new database and nothing else:
 * once a table exists it is skipped entirely, so a column added to schema.ts
 * later would never reach a live database. The app would then fail on every
 * query touching it with "Unknown column" — while the deploy itself looked
 * completely successful.
 *
 * So each boot compares the declared columns against the real ones and adds
 * what is missing. Only ever ADD: never drop, never retype. A column that
 * exists is left exactly as it is, because guessing at a type change is how a
 * migration destroys data.
 *
 * Kept apart from index.ts, and free of `server-only`, so the generated SQL can
 * be tested without a database or a Next.js runtime.
 */

/** Quote a value from our own schema for use as a column default. */
function literal(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Every column the schema declares, as "table.column" in lower case. */
export function declaredColumns(): string[] {
  const out: string[] = [];
  for (const table of Object.values(schema)) {
    if (!is(table, MySqlTable)) continue;
    const config = getTableConfig(table);
    for (const column of config.columns) {
      out.push(`${config.name}.${column.name}`.toLowerCase());
    }
  }
  return out;
}

/**
 * `ALTER TABLE … ADD COLUMN` for every declared column not in `existing`.
 *
 * @param existing "table.column" keys already in the database, lower case.
 */
export function missingColumnStatements(existing: Set<string>): string[] {
  const statements: string[] = [];

  for (const table of Object.values(schema)) {
    if (!is(table, MySqlTable)) continue;
    const config = getTableConfig(table);

    for (const column of config.columns) {
      const key = `${config.name}.${column.name}`.toLowerCase();
      if (existing.has(key)) continue;

      const parts = [`\`${column.name}\``, column.getSQLType()];
      if (column.notNull) parts.push("NOT NULL");
      // Only a literal default belongs in DDL. Columns whose value comes from
      // $defaultFn are filled by the application on insert, and have none here.
      if (column.default !== undefined) {
        parts.push(`DEFAULT ${literal(column.default)}`);
      }
      statements.push(
        `ALTER TABLE \`${config.name}\` ADD COLUMN ${parts.join(" ")}`,
      );
    }
  }

  return statements;
}
