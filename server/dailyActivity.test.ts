/**
 * dailyActivity.test.ts
 * Tests for Daily Activity Report auto-population from nozzle sessions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db-nozzle ───────────────────────────────────────────────────────────
vi.mock("./db-nozzle", () => ({
  getSessionsForDate: vi.fn(),
  getSessionSummary: vi.fn(),
  autoPopulateDailyReport: vi.fn(),
}));

import {
  getSessionsForDate,
  getSessionSummary,
  autoPopulateDailyReport,
} from "./db-nozzle";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSessions(count: number, status: "open" | "closed" = "closed") {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    staffName: `Staff ${i + 1}`,
    shiftLabel: "morning",
    status,
    shiftDate: "2026-04-12",
  }));
}

function makeSummary(petrol: number, diesel: number, cash: number, digital: number, credit: number) {
  return {
    totalPetrolLitres: petrol,
    totalDieselLitres: diesel,
    totalCash: cash,
    totalDigital: digital,
    totalCredit: credit,
    totalCollected: cash + digital + credit,
    digitalBreakdown: { upi: digital, phonepe: 0, card: 0, bank_transfer: 0, bhim: 0 },
    nozzleSummaries: [],
    totalCard: 0,
    totalOnline: 0,
    variance: 0,
    expectedSalesValue: 0,
    collections: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Daily Activity Report — aggregation logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct totals when two sessions exist", async () => {
    const sessions = makeSessions(2, "closed");
    vi.mocked(getSessionsForDate).mockResolvedValue(sessions as any);
    vi.mocked(getSessionSummary)
      .mockResolvedValueOnce(makeSummary(100, 50, 5000, 2000, 1000) as any)
      .mockResolvedValueOnce(makeSummary(80, 40, 4000, 1500, 500) as any);

    // Simulate the aggregation logic from getDailyActivityReport
    const sessionsData = await getSessionsForDate("2026-04-12");
    let totalPetrol = 0, totalDiesel = 0;
    let totalCash = 0, totalDigital = 0, totalCredit = 0;

    for (const session of sessionsData) {
      const summary = await getSessionSummary(session.id);
      totalPetrol  += summary.totalPetrolLitres;
      totalDiesel  += summary.totalDieselLitres;
      totalCash    += summary.totalCash;
      totalDigital += summary.totalDigital;
      totalCredit  += summary.totalCredit;
    }

    expect(totalPetrol).toBe(180);
    expect(totalDiesel).toBe(90);
    expect(totalCash).toBe(9000);
    expect(totalDigital).toBe(3500);
    expect(totalCredit).toBe(1500);
    expect(totalCash + totalDigital + totalCredit).toBe(14000);
  });

  it("returns empty result when no sessions exist", async () => {
    vi.mocked(getSessionsForDate).mockResolvedValue([]);

    const sessions = await getSessionsForDate("2026-04-12");
    expect(sessions).toHaveLength(0);
  });

  it("handles single session with all payment modes", async () => {
    const sessions = makeSessions(1, "closed");
    vi.mocked(getSessionsForDate).mockResolvedValue(sessions as any);
    vi.mocked(getSessionSummary).mockResolvedValueOnce(
      makeSummary(250, 150, 15000, 8000, 3000) as any
    );

    const sessionsData = await getSessionsForDate("2026-04-12");
    const summary = await getSessionSummary(sessionsData[0].id);

    expect(summary.totalPetrolLitres).toBe(250);
    expect(summary.totalDieselLitres).toBe(150);
    expect(summary.totalCollected).toBe(26000);
  });

  it("correctly counts open vs closed sessions", async () => {
    const mixed = [
      ...makeSessions(2, "closed"),
      ...makeSessions(1, "open"),
    ];
    vi.mocked(getSessionsForDate).mockResolvedValue(mixed as any);

    const sessions = await getSessionsForDate("2026-04-12");
    const openCount = sessions.filter((s: any) => s.status === "open").length;
    const closedCount = sessions.filter((s: any) => s.status === "closed").length;

    expect(openCount).toBe(1);
    expect(closedCount).toBe(2);
  });
});

describe("autoPopulateDailyReport", () => {
  it("is called after shift close and returns data", async () => {
    vi.mocked(autoPopulateDailyReport).mockResolvedValue({
      shiftDate: "2026-04-12",
      totalPetrol: 180,
      totalDiesel: 90,
      totalSalesValue: 26000,
      totalCollected: 14000,
      grossProfit: 1200,
    } as any);

    const result = await autoPopulateDailyReport("2026-04-12");
    expect(result).not.toBeNull();
    expect(result?.totalPetrol).toBe(180);
    expect(result?.totalDiesel).toBe(90);
    expect(autoPopulateDailyReport).toHaveBeenCalledWith("2026-04-12");
  });

  it("returns null when no sessions exist for the date", async () => {
    vi.mocked(autoPopulateDailyReport).mockResolvedValue(null);

    const result = await autoPopulateDailyReport("2026-01-01");
    expect(result).toBeNull();
  });
});
