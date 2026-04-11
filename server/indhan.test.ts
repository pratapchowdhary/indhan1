import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createOwnerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "owner-user",
    email: "owner@bees.com",
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

describe("Indhan — Auth", () => {
  it("returns authenticated user from auth.me", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.name).toBe("Kranthi");
    expect(user?.role).toBe("admin");
  });

  it("clears session cookie on logout", async () => {
    const cleared: string[] = [];
    const ctx = createOwnerContext();
    ctx.res = {
      clearCookie: (name: string) => { cleared.push(name); },
    } as unknown as TrpcContext["res"];
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(cleared).toHaveLength(1);
  });
});

describe("Indhan — Sathi AI Agent", () => {
  it("sathi router is registered in appRouter", () => {
    expect(appRouter._def.procedures["sathi.ask"]).toBeDefined();
  });
});

describe("Indhan — Dashboard KPI Calculations", () => {
  it("netProfit = grossProfit - totalExpenses (not daily_reports.netProfit)", async () => {
    // Verify the formula: true net profit is gross profit minus operating expenses
    // FY 2025-26 known values from DB audit:
    // grossProfit = 3388530.04, expenses = 1213852.83, expected netProfit ≈ 2174677.21
    // The key assertion is that netProfit < grossProfit (expenses are deducted)
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const kpis = await caller.dashboard.kpis({ startDate: "2025-04-01", endDate: "2026-03-31" });
    expect(kpis).toBeDefined();
    if (kpis) {
      const gross = Number(kpis.grossProfit ?? 0);
      const expenses = Number(kpis.totalExpenses ?? 0);
      const net = Number(kpis.netProfit ?? 0);
      // Net profit must be less than gross profit (expenses were deducted)
      expect(net).toBeLessThan(gross);
      // Net profit must approximately equal gross - expenses (within \u20b91000 rounding tolerance)
      expect(Math.abs(net - (gross - expenses))).toBeLessThan(1000);
      // For FY 2025-26, net profit should be close to Excel value of 2174293.67
      expect(net).toBeGreaterThan(2000000); // at least \u20b920L
      expect(net).toBeLessThan(2500000);    // at most \u20b925L
    }
  });

  it("totalExpenses comes from expenses ledger (approved only)", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const kpis = await caller.dashboard.kpis({ startDate: "2025-04-01", endDate: "2026-03-31" });
    expect(kpis).toBeDefined();
    if (kpis) {
      const expenses = Number(kpis.totalExpenses ?? 0);
      // FY 2025-26 approved expenses = 1213852.83
      expect(expenses).toBeGreaterThan(1000000); // at least \u20b910L
      expect(expenses).toBeLessThan(2000000);    // at most \u20b920L
    }
  });

  it("dashboard.kpis returns all required fields", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const kpis = await caller.dashboard.kpis({ startDate: "2026-03-01", endDate: "2026-03-31" });
    expect(kpis).toBeDefined();
    if (kpis) {
      expect(kpis).toHaveProperty("totalSales");
      expect(kpis).toHaveProperty("grossProfit");
      expect(kpis).toHaveProperty("totalExpenses");
      expect(kpis).toHaveProperty("netProfit");
      expect(kpis).toHaveProperty("cashBalance");
      expect(kpis).toHaveProperty("totalReceivables");
    }
  });
});

describe("Indhan — Core Routers", () => {
  it("dashboard router is registered", () => {
    expect(appRouter._def.procedures["dashboard.kpis"]).toBeDefined();
  });

  it("customers router is registered", () => {
    expect(appRouter._def.procedures["customers.list"]).toBeDefined();
  });

  it("inventory router is registered", () => {
    expect(appRouter._def.procedures["inventory.list"]).toBeDefined();
  });

  it("expenses router is registered", () => {
    expect(appRouter._def.procedures["expenses.list"]).toBeDefined();
  });

  it("bank router is registered", () => {
    expect(appRouter._def.procedures["bank.list"]).toBeDefined();
  });

  it("reconciliation router is registered", () => {
    expect(appRouter._def.procedures["reconciliation.list"]).toBeDefined();
  });

  it("sales router is registered", () => {
    expect(appRouter._def.procedures["sales.list"]).toBeDefined();
  });
});
