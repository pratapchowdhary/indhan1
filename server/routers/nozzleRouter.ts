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
