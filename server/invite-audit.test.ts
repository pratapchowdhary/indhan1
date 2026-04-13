/**
 * Invite & Audit Log Tests — BEES Fuel Station OS (Indhan)
 * Covers: invitation create/list/revoke, audit log list/filters, auth guards
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";

// ─── Context Helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "owner-user",
    email: "kranthi@bees.com",
    name: "Kranthi",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createInchargeContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "incharge-user",
    email: "incharge@bees.com",
    name: "Incharge",
    loginMethod: "manus",
    role: "incharge",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─── Invitations Tests ────────────────────────────────────────────────────────

describe("Invitations — Auth Guards", () => {
  it("invitations.list rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(caller.invitations.list()).rejects.toThrow(TRPCError);
  });

  it("invitations.list rejects incharge role (non-admin)", async () => {
    const caller = appRouter.createCaller(createInchargeContext());
    await expect(caller.invitations.list()).rejects.toThrow(TRPCError);
  });

  it("invitations.create rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.invitations.create({ email: "test@example.com", role: "incharge", origin: "https://example.com" })
    ).rejects.toThrow(TRPCError);
  });

  it("invitations.create rejects incharge role", async () => {
    const caller = appRouter.createCaller(createInchargeContext());
    await expect(
      caller.invitations.create({ email: "test@example.com", role: "incharge", origin: "https://example.com" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("Invitations — Input Validation", () => {
  it("invitations.create rejects invalid email", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.invitations.create({ email: "not-an-email", role: "incharge", origin: "https://example.com" })
    ).rejects.toThrow(TRPCError);
  });

  it("invitations.create rejects invalid role", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      // @ts-expect-error testing invalid role
      caller.invitations.create({ email: "test@example.com", role: "superadmin", origin: "https://example.com" })
    ).rejects.toThrow(TRPCError);
  });

  it("invitations.create rejects invalid origin URL", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.invitations.create({ email: "test@example.com", role: "incharge", origin: "not-a-url" })
    ).rejects.toThrow(TRPCError);
  });

  it("invitations.getByToken rejects wrong token length", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.invitations.getByToken({ token: "short-token" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("Invitations — Admin Access", () => {
  it("invitations.list returns array for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.invitations.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("invitations.getByToken returns null for non-existent token", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const token = "a".repeat(96); // valid length, non-existent
    const result = await caller.invitations.getByToken({ token });
    expect(result).toBeNull();
  });
});

// ─── Audit Log Tests ──────────────────────────────────────────────────────────

describe("Audit Log — Auth Guards", () => {
  it("auditLog.list rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(caller.auditLog.list({ page: 1, pageSize: 25 })).rejects.toThrow(TRPCError);
  });

  it("auditLog.list rejects incharge role", async () => {
    const caller = appRouter.createCaller(createInchargeContext());
    await expect(caller.auditLog.list({ page: 1, pageSize: 25 })).rejects.toThrow(TRPCError);
  });
});

describe("Audit Log — Input Validation", () => {
  it("auditLog.list rejects page < 1", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.auditLog.list({ page: 0, pageSize: 25 })
    ).rejects.toThrow(TRPCError);
  });

  it("auditLog.list rejects pageSize > 100", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.auditLog.list({ page: 1, pageSize: 200 })
    ).rejects.toThrow(TRPCError);
  });

  it("auditLog.list rejects pageSize < 10", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.auditLog.list({ page: 1, pageSize: 5 })
    ).rejects.toThrow(TRPCError);
  });

  it("auditLog.list rejects invalid date format", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.auditLog.list({ page: 1, pageSize: 25, startDate: "13-04-2026" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("Audit Log — Admin Access", () => {
  it("auditLog.list returns paginated result for admin", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.auditLog.list({ page: 1, pageSize: 25 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.logs)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("auditLog.list accepts module filter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.auditLog.list({ page: 1, pageSize: 25, module: "expenses" });
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("auditLog.list accepts action filter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.auditLog.list({ page: 1, pageSize: 25, action: "create" });
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("auditLog.list accepts valid date range filter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.auditLog.list({
      page: 1,
      pageSize: 25,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(Array.isArray(result.logs)).toBe(true);
  });

  it("auditLog.list accepts search filter", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.auditLog.list({ page: 1, pageSize: 25, search: "Kranthi" });
    expect(Array.isArray(result.logs)).toBe(true);
  });
});
