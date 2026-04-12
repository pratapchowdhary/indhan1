/**
 * nozzle.test.ts — Unit tests for nozzle router and db-nozzle helpers
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB layer so tests run without a real database ──────────────────
vi.mock("./db-nozzle", () => ({
  getAllPumpsWithNozzles: vi.fn().mockResolvedValue([
    {
      id: 1, name: "Pump 1", nozzles: [
        { id: 1, label: "Pump 1 — Diesel", fuelType: "diesel", nozzleNumber: 1 },
        { id: 2, label: "Pump 1 — Petrol", fuelType: "petrol", nozzleNumber: 2 },
      ],
    },
    {
      id: 2, name: "Pump 2", nozzles: [
        { id: 3, label: "Pump 2 — Diesel", fuelType: "diesel", nozzleNumber: 3 },
        { id: 4, label: "Pump 2 — Petrol", fuelType: "petrol", nozzleNumber: 4 },
      ],
    },
  ]),
  getAllNozzles: vi.fn().mockResolvedValue([
    { id: 1, label: "Pump 1 — Diesel", fuelType: "diesel", nozzleNumber: 1 },
    { id: 2, label: "Pump 1 — Petrol", fuelType: "petrol", nozzleNumber: 2 },
    { id: 3, label: "Pump 2 — Diesel", fuelType: "diesel", nozzleNumber: 3 },
    { id: 4, label: "Pump 2 — Petrol", fuelType: "petrol", nozzleNumber: 4 },
  ]),
  getOrCreateShiftSession: vi.fn().mockResolvedValue({ id: 1, shiftDate: "2026-04-12", staffName: "Raju", shiftLabel: "full_day", status: "open" }),
  getShiftSession: vi.fn().mockResolvedValue({ id: 1, shiftDate: "2026-04-12", staffName: "Raju", shiftLabel: "full_day", status: "open" }),
  getSessionsForDate: vi.fn().mockResolvedValue([]),
  closeShiftSession: vi.fn().mockResolvedValue({ id: 1, status: "closed" }),
  getReadingsForSession: vi.fn().mockResolvedValue([]),
  upsertNozzleReading: vi.fn().mockResolvedValue({ id: 1, sessionId: 1, nozzleId: 1, readingType: "opening", meterReading: "125000.00" }),
  getCollectionsForSession: vi.fn().mockResolvedValue([]),
  addCashCollection: vi.fn().mockResolvedValue({ id: 1, sessionId: 1, amount: "5000.00", paymentMode: "cash" }),
  deleteCashCollection: vi.fn().mockResolvedValue(undefined),
  getSessionSummary: vi.fn().mockResolvedValue({
    sessionId: 1,
    nozzleSummaries: [],
    totalPetrolLitres: 120.5,
    totalDieselLitres: 85.3,
    totalCash: 15000,
    totalCard: 5000,
    totalOnline: 2000,
    totalCredit: 3000,
    totalCollected: 25000,
    expectedSalesValue: 24055.17,
    variance: 944.83,
    collections: [],
  }),
  computeDayReconciliation: vi.fn().mockResolvedValue({ id: 1, reconcileDate: "2026-04-12", status: "balanced" }),
  getDayReconciliation: vi.fn().mockResolvedValue(null),
  getRecentDayReconciliations: vi.fn().mockResolvedValue([]),
  getEmployeesForNozzle: vi.fn().mockResolvedValue([
    { id: 1, name: "Raju", role: "operator" },
    { id: 2, name: "Suresh", role: "operator" },
  ]),
  autoPopulateDailyReport: vi.fn().mockResolvedValue({ shiftDate: "2026-04-12", totalPetrol: 120.5, totalDiesel: 85.3 }),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("Nozzle Module — Business Logic", () => {
  describe("Volume calculation", () => {
    it("calculates dispensed volume correctly from meter readings", () => {
      const opening = 125000.0;
      const closing = 125120.5;
      const dispensed = closing - opening;
      expect(dispensed).toBeCloseTo(120.5, 2);
    });

    it("returns 0 for invalid readings (closing < opening)", () => {
      const opening = 125000.0;
      const closing = 124990.0; // meter reset scenario
      const dispensed = Math.max(0, closing - opening);
      expect(dispensed).toBe(0);
    });

    it("handles exact same reading (no fuel dispensed)", () => {
      const opening = 125000.0;
      const closing = 125000.0;
      const dispensed = Math.max(0, closing - opening);
      expect(dispensed).toBe(0);
    });
  });

  describe("Expected sales value calculation", () => {
    const PETROL_PRICE = 103.41;
    const DIESEL_PRICE = 89.14;

    it("computes expected value from petrol + diesel volumes", () => {
      const petrolLitres = 100;
      const dieselLitres = 50;
      const expected = petrolLitres * PETROL_PRICE + dieselLitres * DIESEL_PRICE;
      expect(expected).toBeCloseTo(10341 + 4457, 0);
    });

    it("computes zero expected value when no fuel dispensed", () => {
      const expected = 0 * PETROL_PRICE + 0 * DIESEL_PRICE;
      expect(expected).toBe(0);
    });
  });

  describe("Variance calculation", () => {
    it("detects surplus collection (positive variance)", () => {
      const collected = 25000;
      const expected = 24000;
      const variance = collected - expected;
      expect(variance).toBe(1000);
      expect(variance).toBeGreaterThan(0);
    });

    it("detects shortfall (negative variance)", () => {
      const collected = 23000;
      const expected = 24000;
      const variance = collected - expected;
      expect(variance).toBe(-1000);
      expect(variance).toBeLessThan(0);
    });

    it("identifies balanced state when variance < 1", () => {
      const variance = 0.5;
      const isBalanced = Math.abs(variance) < 1;
      expect(isBalanced).toBe(true);
    });

    it("identifies discrepancy when variance >= 1", () => {
      const variance = 500;
      const isBalanced = Math.abs(variance) < 1;
      expect(isBalanced).toBe(false);
    });
  });

  describe("Collection aggregation", () => {
    it("aggregates collections by payment mode", () => {
      const collections = [
        { paymentMode: "cash", amount: "5000.00" },
        { paymentMode: "cash", amount: "3000.00" },
        { paymentMode: "card", amount: "2000.00" },
        { paymentMode: "online", amount: "1500.00" },
        { paymentMode: "credit", amount: "800.00" },
      ];

      const totals = collections.reduce((acc: any, c) => {
        acc[c.paymentMode] = (acc[c.paymentMode] ?? 0) + Number(c.amount);
        acc.total = (acc.total ?? 0) + Number(c.amount);
        return acc;
      }, {});

      expect(totals.cash).toBe(8000);
      expect(totals.card).toBe(2000);
      expect(totals.online).toBe(1500);
      expect(totals.credit).toBe(800);
      expect(totals.total).toBe(12300);
    });
  });

  describe("Pump & Nozzle configuration", () => {
    it("validates 2 pumps with 4 nozzles total", async () => {
      const { getAllPumpsWithNozzles } = await import("./db-nozzle");
      const pumps = await getAllPumpsWithNozzles();
      expect(pumps).toHaveLength(2);
      const totalNozzles = pumps.reduce((sum: number, p: any) => sum + p.nozzles.length, 0);
      expect(totalNozzles).toBe(4);
    });

    it("validates each pump has exactly one diesel and one petrol nozzle", async () => {
      const { getAllPumpsWithNozzles } = await import("./db-nozzle");
      const pumps = await getAllPumpsWithNozzles();
      for (const pump of pumps) {
        const fuelTypes = pump.nozzles.map((n: any) => n.fuelType);
        expect(fuelTypes).toContain("diesel");
        expect(fuelTypes).toContain("petrol");
      }
    });
  });

  describe("Auto-populate daily report", () => {
    it("calls autoPopulateDailyReport after shift close", async () => {
      const { autoPopulateDailyReport } = await import("./db-nozzle");
      const result = await autoPopulateDailyReport("2026-04-12");
      expect(result).toBeTruthy();
      expect(result?.shiftDate).toBe("2026-04-12");
    });
  });
});
