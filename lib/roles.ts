import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { userRoles } from "./db/schema";
import type { Role } from "./roles-shared";

// Re-export the client-safe metadata + pure helpers so server code can import
// everything from one place (./roles), while client code imports ./roles-shared.
export * from "./roles-shared";

export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role as Role);
}
