/**
 * nozzleRouter.ts — tRPC procedures for Nozzle Sales & Cash Collection module
 * Integrated with daily_reports: closing a shift auto-populates the daily report.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllPumpsWithNozzles,
  getAllNozzles,
  getOrCreateShiftSession,
  getShiftSession,
  getSessionsForDate,
  closeShiftSession,
  getReadingsForSession,
  upsertNozzleReading,
  getCollectionsForSession,
  addCashCollection,
  deleteCashCollection,
  getSessionSummary,
  computeDayReconciliation,
  getDayReconciliation,
  getRecentDayReconciliations,
  getEmployeesForNozzle,
  autoPopulateDailyReport,
  getPreviousClosingReadings,
} from "../db-nozzle";

const safeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const nozzleRouter = router({
  // ── Configuration ──────────────────────────────────────────────────────────
  getPumpsWithNozzles: protectedProcedure.query(async () => {
    return getAllPumpsWithNozzles();
  }),

  getNozzles: protectedProcedure.query(async () => {
    return getAllNozzles();
  }),

  getStaffList: protectedProcedure.query(async () => {
    return getEmployeesForNozzle();
  }),

  /** Get the most recent closing meter reading for each nozzle before the given shift date.
   *  Used to display previous shift closing on the Opening Readings screen. */
  getPreviousClosingReadings: protectedProcedure
    .input(z.object({ shiftDate: safeDate }))
    .query(async ({ input }) => {
      return getPreviousClosingReadings(input.shiftDate);
    }),

  // ── Shift Sessions ─────────────────────────────────────────────────────────
  startShift: protectedProcedure
    .input(z.object({
      shiftDate: safeDate,
      employeeId: z.number().int().positive(),
      staffName: z.string().min(1).max(100),
      shiftLabel: z.enum(["morning", "evening", "full_day"]).default("full_day"),
    }))
    .mutation(async ({ input }) => {
      return getOrCreateShiftSession(
        input.shiftDate,
        input.employeeId,
        input.staffName,
        input.shiftLabel
      );
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const session = await getShiftSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),

  getSessionsForDate: protectedProcedure
    .input(z.object({ shiftDate: safeDate }))
    .query(async ({ input }) => {
      return getSessionsForDate(input.shiftDate);
    }),

  closeShift: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getShiftSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "reconciled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session already reconciled" });
      }
      const closed = await closeShiftSession(input.sessionId, input.notes);
      // Auto-populate daily_reports with aggregated nozzle data
      await autoPopulateDailyReport(session.shiftDate);
      return closed;
    }),

  // ── Nozzle Readings ────────────────────────────────────────────────────────
  getReadings: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getReadingsForSession(input.sessionId);
    }),

  saveReading: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      nozzleId: z.number().int().positive(),
      readingType: z.enum(["opening", "closing"]),
      meterReading: z.number().min(0).max(9999999),
      recordedBy: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getShiftSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "reconciled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a reconciled session" });
      }
      return upsertNozzleReading({
        sessionId: input.sessionId,
        nozzleId: input.nozzleId,
        readingType: input.readingType,
        meterReading: input.meterReading,
        recordedBy: input.recordedBy,
        notes: input.notes,
      });
    }),

  // ── Cash Collections ───────────────────────────────────────────────────────
  getCollections: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getCollectionsForSession(input.sessionId);
    }),

  addCollection: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      nozzleId: z.number().int().positive().optional(),
      amount: z.number().positive().max(10000000),
      paymentMode: z.enum(["cash", "digital", "credit"]),
      digitalSubType: z.enum(["upi", "phonepe", "card", "bank_transfer", "bhim"]).optional(),
      customerId: z.number().int().positive().optional(),
      customerName: z.string().max(255).optional(),
      notes: z.string().max(500).optional(),
      recordedBy: z.string().max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = await getShiftSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "reconciled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify a reconciled session" });
      }
      return addCashCollection({
        sessionId: input.sessionId,
        nozzleId: input.nozzleId,
        amount: input.amount,
        paymentMode: input.paymentMode,
        digitalSubType: input.digitalSubType,
        customerId: input.customerId,
        customerName: input.customerName,
        notes: input.notes,
        recordedBy: input.recordedBy,
      });
    }),

  deleteCollection: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteCashCollection(input.id);
      return { success: true };
    }),

  // ── Session Summary (live) ─────────────────────────────────────────────────
  getSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getSessionSummary(input.sessionId);
    }),

  // ── Day Reconciliation ─────────────────────────────────────────────────────
  computeDayReconciliation: protectedProcedure
    .input(z.object({ shiftDate: safeDate }))
    .mutation(async ({ input }) => {
      return computeDayReconciliation(input.shiftDate);
    }),

  getDayReconciliation: protectedProcedure
    .input(z.object({ shiftDate: safeDate }))
    .query(async ({ input }) => {
      return getDayReconciliation(input.shiftDate);
    }),

  getRecentReconciliations: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      return getRecentDayReconciliations(input.limit);
    }),

  // ── Daily Activity Report — live data from nozzle sessions ─────────────────
  // Returns a full daily activity summary for a given date, aggregated from
  // all nozzle sessions. No manual entry needed — data flows automatically.
  getDailyActivityReport: protectedProcedure
    .input(z.object({ reportDate: safeDate }))
    .query(async ({ input }) => {
      const sessions = await getSessionsForDate(input.reportDate);

      let totalPetrol = 0, totalDiesel = 0;
      let totalCash = 0, totalDigital = 0, totalCredit = 0;
      const digitalBreakdown: Record<string, number> = { upi: 0, phonepe: 0, card: 0, bank_transfer: 0, bhim: 0 };
      const sessionDetails: any[] = [];

      for (const session of sessions) {
        const summary = await getSessionSummary(session.id);
        totalPetrol  += summary.totalPetrolLitres;
        totalDiesel  += summary.totalDieselLitres;
        totalCash    += summary.totalCash;
        totalDigital += summary.totalDigital;
        totalCredit  += summary.totalCredit;
        // Merge digital breakdown
        for (const [k, v] of Object.entries(summary.digitalBreakdown ?? {})) {
          if (k in digitalBreakdown) digitalBreakdown[k] += v as number;
        }
        sessionDetails.push({
          sessionId: session.id,
          staffName: session.staffName,
          shiftLabel: session.shiftLabel,
          status: session.status,
          nozzleSummaries: summary.nozzleSummaries,
          totalCash: summary.totalCash,
          totalDigital: summary.totalDigital,
          totalCredit: summary.totalCredit,
          totalCollected: summary.totalCollected,
          totalPetrolLitres: summary.totalPetrolLitres,
          totalDieselLitres: summary.totalDieselLitres,
        });
      }

      const totalCollected = totalCash + totalDigital + totalCredit;

      return {
        reportDate: input.reportDate,
        sessions: sessionDetails,
        sessionCount: sessions.length,
        openSessions: sessions.filter(s => s.status === "open").length,
        closedSessions: sessions.filter(s => s.status === "closed").length,
        // Volumes
        totalPetrolLitres: totalPetrol,
        totalDieselLitres: totalDiesel,
        totalLitres: totalPetrol + totalDiesel,
        // Collections
        totalCash,
        totalDigital,
        digitalBreakdown,
        totalCredit,
        totalCollected,
        // Computed from stored daily_reports (populated by autoPopulateDailyReport)
        hasDailyReport: sessions.length > 0,
      };
    }),

  // ── Get recent daily activity reports (last N days) ─────────────────────────
  getRecentDailyActivity: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const results = [];
      const today = new Date();
      for (let i = 0; i < input.days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const sessions = await getSessionsForDate(dateStr);
        if (sessions.length === 0) continue;
        let totalPetrol = 0, totalDiesel = 0, totalCollected = 0;
        for (const session of sessions) {
          const summary = await getSessionSummary(session.id);
          totalPetrol  += summary.totalPetrolLitres;
          totalDiesel  += summary.totalDieselLitres;
          totalCollected += summary.totalCollected;
        }
        results.push({ date: dateStr, totalPetrol, totalDiesel, totalCollected, sessionCount: sessions.length });
      }
      return results.reverse(); // chronological order
    }),

  // ── Nozzle data for Reconciliation page integration ────────────────────────
  getNozzleDataForDate: protectedProcedure
    .input(z.object({ shiftDate: safeDate }))
    .query(async ({ input }) => {
      const sessions = await getSessionsForDate(input.shiftDate);
      if (sessions.length === 0) return null;

      let totalPetrolLitres = 0;
      let totalDieselLitres = 0;
      let totalCash = 0;
      let totalCard = 0;
      let totalOnline = 0;
      let totalCredit = 0;
      const sessionSummaries = [];

      for (const session of sessions) {
        const summary = await getSessionSummary(session.id);
        totalPetrolLitres += summary.totalPetrolLitres;
        totalDieselLitres += summary.totalDieselLitres;
        totalCash    += summary.totalCash;
        totalCard    += summary.totalCard;
        totalOnline  += summary.totalOnline;
        totalCredit  += summary.totalCredit;
        sessionSummaries.push({
          sessionId: session.id,
          staffName: session.staffName,
          shiftLabel: session.shiftLabel,
          status: session.status,
          nozzleSummaries: summary.nozzleSummaries,
          totalCash: summary.totalCash,
          totalCard: summary.totalCard,
          totalOnline: summary.totalOnline,
          totalCredit: summary.totalCredit,
          totalCollected: summary.totalCollected,
          totalPetrolLitres: summary.totalPetrolLitres,
          totalDieselLitres: summary.totalDieselLitres,
          variance: summary.variance,
        });
      }

      const PETROL_PRICE = 103.41;
      const DIESEL_PRICE = 89.14;
      const expectedSalesValue = totalPetrolLitres * PETROL_PRICE + totalDieselLitres * DIESEL_PRICE;
      const totalCollected = totalCash + totalCard + totalOnline + totalCredit;

      return {
        shiftDate: input.shiftDate,
        sessions: sessionSummaries,
        totalPetrolLitres,
        totalDieselLitres,
        totalCash,
        totalCard,
        totalOnline,
        totalCredit,
        totalCollected,
        expectedSalesValue,
        variance: totalCollected - expectedSalesValue,
        hasOpenSessions: sessions.some(s => s.status === "open"),
      };
    }),
});
