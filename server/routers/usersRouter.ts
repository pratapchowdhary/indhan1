import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { logAudit } from "./auditLogRouter";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  accountant: "Accountant",
  incharge: "Incharge",
  pump_attendant: "Pump Attendant",
  user: "User",
};

export const usersRouter = router({
  // List all users who have ever logged in
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.lastSignedIn));

    return result.map((u: typeof result[0]) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
    }));
  }),

  // Update a user's role (admin only, cannot demote self)
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(["admin", "owner", "accountant", "incharge", "pump_attendant", "user"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Prevent self-demotion to non-admin role
      if (ctx.user.id === input.userId && input.role !== "admin" && input.role !== "owner") {
        throw new Error("You cannot change your own role to a non-admin role.");
      }

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      await logAudit({ userId: ctx.user.id, userName: ctx.user.name, userRole: ctx.user.role, action: "role_change", module: "users", resourceId: input.userId, details: `Role changed to: ${input.role}` });
      return { success: true };
    }),
});
