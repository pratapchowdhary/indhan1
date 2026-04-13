import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { desc, and, gte, lte, eq, like } from "drizzle-orm";

// ─── Reusable audit log helper ────────────────────────────────────────────────
// Call this from any mutation that should be audited.
export async function logAudit(params: {
  userId: number;
  userName?: string | null;
  userRole?: string | null;
  action: string;        // "create" | "update" | "delete" | "approve" | "login" | "invite" | "role_change"
  module: string;        // "expenses" | "bank" | "customers" | "fuel_prices" | "payroll" | "users" | ...
  resourceId?: string | number | null;
  details?: string | null;
  ipAddress?: string | null;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      userId: params.userId,
      userName: params.userName ?? null,
      userRole: params.userRole ?? null,
      action: params.action,
      module: params.module,
      resourceId: params.resourceId != null ? String(params.resourceId) : null,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    // Audit logging should never crash the main operation
    console.warn("[AuditLog] Failed to write audit log:", err);
  }
}

// ─── Audit Log Router ─────────────────────────────────────────────────────────
export const auditLogRouter = router({
  // List audit logs with filters (admin/accountant only)
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(50),
        userId: z.number().optional(),
        module: z.string().optional(),
        action: z.string().optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        search: z.string().max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0, page: input.page, pageSize: input.pageSize };

      const conditions = [];

      if (input.userId) {
        conditions.push(eq(auditLogs.userId, input.userId));
      }
      if (input.module) {
        conditions.push(eq(auditLogs.module, input.module));
      }
      if (input.action) {
        conditions.push(eq(auditLogs.action, input.action));
      }
      if (input.startDate) {
        conditions.push(gte(auditLogs.createdAt, new Date(input.startDate + "T00:00:00")));
      }
      if (input.endDate) {
        conditions.push(lte(auditLogs.createdAt, new Date(input.endDate + "T23:59:59")));
      }
      if (input.search) {
        conditions.push(like(auditLogs.details, `%${input.search}%`));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const offset = (input.page - 1) * input.pageSize;

      const [logs, countResult] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(whereClause)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: auditLogs.id })
          .from(auditLogs)
          .where(whereClause),
      ]);

      return {
        logs,
        total: countResult.length,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // Get distinct modules for filter dropdown
  getModules: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ module: auditLogs.module })
      .from(auditLogs)
      .orderBy(auditLogs.module);
    return rows.map(r => r.module);
  }),

  // Get distinct users who have audit log entries
  getUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({
        userId: auditLogs.userId,
        userName: auditLogs.userName,
        userRole: auditLogs.userRole,
      })
      .from(auditLogs)
      .orderBy(auditLogs.userName);
    return rows;
  }),
});
