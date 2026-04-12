/**
 * Attendance Router — Biometric + Geo-fence attendance system
 *
 * Shift rules:
 * - Mahesh (Incharge): check-ins 06:00–22:00, breaks excused
 * - Pump Attendants: 24h rotation, check-ins only 06:00–22:00
 * - NO check-ins generated between 22:00–06:00 (sleep/quiet hours)
 * - Each hour 06:00–21:00 = 1 slot per active employee = 16 slots/day
 * - Slot fires at a random minute within the hour
 * - Employee has 15 minutes to verify
 * - Attendance counted if score ≥ 90%
 *
 * Geo-fence: BEES Fuel Station, NH-44, Kothur, Hyderabad
 * Lat: 17.0667, Lng: 78.5167 (approximate)
 * Radius: 50 metres
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  employees, employeeAuth, checkinSlots, attendanceScore, payrollRequests,
  CheckinSlot,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";

// Station coordinates
const STATION_LAT = 17.0667;
const STATION_LNG = 78.5167;
const GEOFENCE_RADIUS_M = 50;

// Check-in window hours (inclusive)
const CHECKIN_START_HOUR = 6;
const CHECKIN_END_HOUR = 21;

// Haversine distance in metres
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Generate today's check-in slots for an employee
async function generateDailySlots(employeeId: number, dateStr: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const existing = await db
    .select({ id: checkinSlots.id })
    .from(checkinSlots)
    .where(and(eq(checkinSlots.employeeId, employeeId), eq(checkinSlots.slotDate, dateStr)));

  if (existing.length > 0) return existing.length;

  const slots: Array<{
    employeeId: number;
    slotDate: string;
    slotHour: number;
    scheduledAt: Date;
    windowEndsAt: Date;
    status: 'pending';
  }> = [];

  for (let hour = CHECKIN_START_HOUR; hour <= CHECKIN_END_HOUR; hour++) {
    const randomMinute = Math.floor(Math.random() * 45);
    const [year, month, day] = dateStr.split('-').map(Number);
    const scheduledAt = new Date(year, month - 1, day, hour, randomMinute, 0);
    const windowEndsAt = new Date(scheduledAt.getTime() + 15 * 60 * 1000);
    slots.push({ employeeId, slotDate: dateStr, slotHour: hour, scheduledAt, windowEndsAt, status: 'pending' });
  }

  if (slots.length > 0) {
    await db.insert(checkinSlots).values(slots);
  }
  return slots.length;
}

// Recalculate and upsert daily attendance score
async function updateDailyScore(employeeId: number, dateStr: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const slots = await db
    .select()
    .from(checkinSlots)
    .where(and(eq(checkinSlots.employeeId, employeeId), eq(checkinSlots.slotDate, dateStr)));

  const total = slots.length;
  const verified = slots.filter((s: CheckinSlot) => s.status === 'verified').length;
  const missed = slots.filter((s: CheckinSlot) => s.status === 'missed').length;
  const excused = slots.filter((s: CheckinSlot) => s.status === 'excused').length;
  const scorePercent = total > 0 ? (verified / total) * 100 : 0;
  const dayStatus: 'present' | 'partial' | 'absent' =
    scorePercent >= 90 ? 'present' : scorePercent >= 50 ? 'partial' : 'absent';

  const existing = await db
    .select({ id: attendanceScore.id })
    .from(attendanceScore)
    .where(and(eq(attendanceScore.employeeId, employeeId), eq(attendanceScore.scoreDate, dateStr)));

  if (existing.length > 0) {
    await db.update(attendanceScore)
      .set({
        totalSlots: total, verifiedSlots: verified, missedSlots: missed,
        excusedSlots: excused, scorePercent: scorePercent.toFixed(2), dayStatus,
      })
      .where(and(eq(attendanceScore.employeeId, employeeId), eq(attendanceScore.scoreDate, dateStr)));
  } else {
    await db.insert(attendanceScore).values({
      employeeId, scoreDate: dateStr, totalSlots: total, verifiedSlots: verified,
      missedSlots: missed, excusedSlots: excused, scorePercent: scorePercent.toFixed(2), dayStatus,
    });
  }
}

export const attendanceRouter = router({
  // ── Admin: set employee PIN ──────────────────────────────────────────────────
  setEmployeePin: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const pinHash = await bcrypt.hash(input.pin, 10);
      const existing = await db
        .select({ id: employeeAuth.id })
        .from(employeeAuth)
        .where(eq(employeeAuth.employeeId, input.employeeId));

      if (existing.length > 0) {
        await db.update(employeeAuth)
          .set({ pinHash, updatedAt: new Date() })
          .where(eq(employeeAuth.employeeId, input.employeeId));
      } else {
        await db.insert(employeeAuth).values({ employeeId: input.employeeId, pinHash, faceEnrolled: false });
      }
      return { success: true };
    }),

  // ── Employee: login with PIN ─────────────────────────────────────────────────
  employeeLogin: publicProcedure
    .input(z.object({ employeeId: z.number(), pin: z.string().length(6) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [auth] = await db.select().from(employeeAuth).where(eq(employeeAuth.employeeId, input.employeeId));
      if (!auth) throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });

      if (auth.lockedUntil && new Date() < auth.lockedUntil) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Account locked. Try again later.' });
      }

      const valid = await bcrypt.compare(input.pin, auth.pinHash);
      if (!valid) {
        const newAttempts = (auth.failedAttempts || 0) + 1;
        const lockedUntil = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
        await db.update(employeeAuth)
          .set({ failedAttempts: newAttempts, ...(lockedUntil ? { lockedUntil } : {}) })
          .where(eq(employeeAuth.employeeId, input.employeeId));
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect PIN' });
      }

      await db.update(employeeAuth)
        .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(employeeAuth.employeeId, input.employeeId));

      const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
      return {
        success: true,
        employee: { id: emp.id, name: emp.name, role: emp.role },
        faceEnrolled: auth.faceEnrolled ?? false,
      };
    }),

  // ── Employee: enrol face descriptor ─────────────────────────────────────────
  enrollFace: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      pin: z.string().length(6),
      faceDescriptor: z.array(z.number()).length(128),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [auth] = await db.select().from(employeeAuth).where(eq(employeeAuth.employeeId, input.employeeId));
      if (!auth) throw new TRPCError({ code: 'NOT_FOUND' });

      const valid = await bcrypt.compare(input.pin, auth.pinHash);
      if (!valid) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect PIN' });

      await db.update(employeeAuth)
        .set({
          faceDescriptor: JSON.stringify(input.faceDescriptor),
          faceEnrolled: true,
          faceEnrolledAt: new Date(),
        })
        .where(eq(employeeAuth.employeeId, input.employeeId));

      return { success: true };
    }),

  // ── Generate today's slots for all active employees ──────────────────────────
  generateTodaySlots: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const today = new Date().toISOString().split('T')[0];
      const activeEmps = await db.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true));

      let total = 0;
      for (const emp of activeEmps) {
        const count = await generateDailySlots(emp.id, today);
        total += count;
      }
      return { success: true, slotsGenerated: total, date: today };
    }),

  // ── Get pending slot for employee (active check-in window) ───────────────────
  getPendingSlot: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      await generateDailySlots(input.employeeId, today);

      const [slot] = await db
        .select()
        .from(checkinSlots)
        .where(and(
          eq(checkinSlots.employeeId, input.employeeId),
          eq(checkinSlots.slotDate, today),
          eq(checkinSlots.status, 'pending'),
          lte(checkinSlots.scheduledAt, now),
          gte(checkinSlots.windowEndsAt, now),
        ))
        .limit(1);

      return slot ?? null;
    }),

  // ── Verify check-in (face match + geo-fence) ─────────────────────────────────
  verifyCheckin: publicProcedure
    .input(z.object({
      slotId: z.number(),
      employeeId: z.number(),
      faceDescriptor: z.array(z.number()).length(128),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [slot] = await db
        .select()
        .from(checkinSlots)
        .where(and(eq(checkinSlots.id, input.slotId), eq(checkinSlots.employeeId, input.employeeId)));

      if (!slot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Slot not found' });
      if (slot.status !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Slot already processed' });

      const now = new Date();
      if (now > slot.windowEndsAt) {
        await db.update(checkinSlots).set({ status: 'missed' }).where(eq(checkinSlots.id, input.slotId));
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Check-in window has expired' });
      }

      // Geo-fence check
      const distanceM = haversineDistance(input.latitude, input.longitude, STATION_LAT, STATION_LNG);
      const withinFence = distanceM <= GEOFENCE_RADIUS_M;

      // Face match check
      const [auth] = await db
        .select({ faceDescriptor: employeeAuth.faceDescriptor })
        .from(employeeAuth)
        .where(eq(employeeAuth.employeeId, input.employeeId));

      if (!auth?.faceDescriptor) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Face not enrolled. Please enrol first.' });
      }

      const storedDescriptor: number[] = JSON.parse(auth.faceDescriptor);
      const euclideanDist = Math.sqrt(
        storedDescriptor.reduce((sum: number, val: number, i: number) => sum + (val - input.faceDescriptor[i]) ** 2, 0)
      );
      const faceMatchScore = Math.max(0, 1 - euclideanDist);
      const faceMatched = euclideanDist < 0.6;

      if (!faceMatched) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Face not recognised. Please try again.' });
      }
      if (!withinFence) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `You are ${Math.round(distanceM)}m from the station. Must be within ${GEOFENCE_RADIUS_M}m.`
        });
      }

      await db.update(checkinSlots)
        .set({
          status: 'verified',
          verifiedAt: now,
          latitude: input.latitude.toString(),
          longitude: input.longitude.toString(),
          distanceMetres: distanceM.toFixed(2),
          faceMatchScore: faceMatchScore.toFixed(4),
          verificationMethod: 'face_geo',
        })
        .where(eq(checkinSlots.id, input.slotId));

      await updateDailyScore(input.employeeId, slot.slotDate);

      return { success: true, distanceMetres: Math.round(distanceM), faceMatchScore: faceMatchScore.toFixed(2) };
    }),

  // ── Get employee's attendance score for a date range ─────────────────────────
  getAttendanceScore: publicProcedure
    .input(z.object({ employeeId: z.number(), fromDate: z.string(), toDate: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { scores: [], summary: { totalSlots: 0, verifiedSlots: 0, overallScore: 0, presentDays: 0, eligible: false } };

      const scores = await db
        .select()
        .from(attendanceScore)
        .where(and(
          eq(attendanceScore.employeeId, input.employeeId),
          gte(attendanceScore.scoreDate, input.fromDate),
          lte(attendanceScore.scoreDate, input.toDate),
        ))
        .orderBy(desc(attendanceScore.scoreDate));

      const totalSlots = scores.reduce((s: number, r: typeof scores[0]) => s + (r.totalSlots || 0), 0);
      const verifiedSlots = scores.reduce((s: number, r: typeof scores[0]) => s + (r.verifiedSlots || 0), 0);
      const overallScore = totalSlots > 0 ? (verifiedSlots / totalSlots) * 100 : 0;
      const presentDays = scores.filter((s: typeof scores[0]) => s.dayStatus === 'present' || s.dayStatus === 'partial').length;

      return {
        scores,
        summary: {
          totalSlots, verifiedSlots,
          overallScore: parseFloat(overallScore.toFixed(2)),
          presentDays,
          eligible: overallScore >= 90,
        }
      };
    }),

  // ── Get all employees' today's slots (admin view) ────────────────────────────
  getTodayOverview: protectedProcedure
    .query(async ({ ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) return [];

      const today = new Date().toISOString().split('T')[0];
      const activeEmps = await db.select().from(employees).where(eq(employees.isActive, true));

      const result = [];
      for (const emp of activeEmps) {
        const slots = await db
          .select()
          .from(checkinSlots)
          .where(and(eq(checkinSlots.employeeId, emp.id), eq(checkinSlots.slotDate, today)));

        const verified = slots.filter((s: CheckinSlot) => s.status === 'verified').length;
        const missed = slots.filter((s: CheckinSlot) => s.status === 'missed').length;
        const pending = slots.filter((s: CheckinSlot) => s.status === 'pending').length;
        const score = slots.length > 0 ? (verified / slots.length) * 100 : 0;
        const lastVerifiedSlot = slots
          .filter((s: CheckinSlot) => s.verifiedAt)
          .sort((a: CheckinSlot, b: CheckinSlot) =>
            new Date(b.verifiedAt!).getTime() - new Date(a.verifiedAt!).getTime()
          )[0];

        result.push({
          employee: { id: emp.id, name: emp.name, role: emp.role },
          slots: slots.length, verified, missed, pending,
          score: parseFloat(score.toFixed(1)),
          lastVerified: lastVerifiedSlot?.verifiedAt ?? null,
        });
      }
      return result;
    }),

  // ── Employee: request payroll ─────────────────────────────────────────────────
  requestPayroll: publicProcedure
    .input(z.object({
      employeeId: z.number(),
      requestType: z.enum(['weekly', 'monthly']),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
      if (!emp) throw new TRPCError({ code: 'NOT_FOUND' });

      const scores = await db
        .select()
        .from(attendanceScore)
        .where(and(
          eq(attendanceScore.employeeId, input.employeeId),
          gte(attendanceScore.scoreDate, input.periodStart),
          lte(attendanceScore.scoreDate, input.periodEnd),
        ));

      const totalSlots = scores.reduce((s: number, r: typeof scores[0]) => s + (r.totalSlots || 0), 0);
      const verifiedSlots = scores.reduce((s: number, r: typeof scores[0]) => s + (r.verifiedSlots || 0), 0);
      const scorePercent = totalSlots > 0 ? (verifiedSlots / totalSlots) * 100 : 0;

      if (scorePercent < 90) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Attendance score ${scorePercent.toFixed(1)}% is below the 90% threshold required for payment.`
        });
      }

      const presentDays = scores.filter((s: typeof scores[0]) => s.dayStatus === 'present' || s.dayStatus === 'partial').length;
      const dailyRate = parseFloat(emp.basicSalary.toString()) / (emp.monthlyWorkingDays ?? 26);
      const grossAmount = dailyRate * presentDays;
      const pfDeduction = emp.pfApplicable ? grossAmount * 0.12 : 0;
      const esiDeduction = emp.esiApplicable ? grossAmount * 0.0075 : 0;
      const deductions = pfDeduction + esiDeduction;
      const netAmount = grossAmount - deductions;

      const [req] = await db.insert(payrollRequests).values({
        employeeId: input.employeeId,
        requestType: input.requestType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        attendanceScore: scorePercent.toFixed(2),
        eligibleDays: presentDays.toFixed(1),
        grossAmount: grossAmount.toFixed(2),
        deductions: deductions.toFixed(2),
        netAmount: netAmount.toFixed(2),
        status: 'pending',
      });

      return {
        success: true,
        requestId: (req as any).insertId,
        summary: {
          presentDays, scorePercent: parseFloat(scorePercent.toFixed(1)),
          grossAmount: parseFloat(grossAmount.toFixed(2)),
          deductions: parseFloat(deductions.toFixed(2)),
          netAmount: parseFloat(netAmount.toFixed(2)),
        }
      };
    }),

  // ── Admin: list pending payroll requests ─────────────────────────────────────
  listPayrollRequests: protectedProcedure
    .input(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'paid', 'all']).default('pending') }))
    .query(async ({ input, ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) return [];

      const base = db
        .select({
          request: payrollRequests,
          employee: { id: employees.id, name: employees.name, role: employees.role },
        })
        .from(payrollRequests)
        .innerJoin(employees, eq(payrollRequests.employeeId, employees.id))
        .orderBy(desc(payrollRequests.requestedAt));

      if (input.status !== 'all') {
        return base.where(eq(payrollRequests.status, input.status));
      }
      return base;
    }),

  // ── Admin: approve/reject/mark paid payroll request ──────────────────────────
  reviewPayrollRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      action: z.enum(['approved', 'rejected', 'paid']),
      notes: z.string().optional(),
      paymentMode: z.enum(['bank', 'cash']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      await db.update(payrollRequests)
        .set({
          status: input.action,
          reviewedBy: ctx.user.name || ctx.user.openId,
          reviewedAt: new Date(),
          reviewNotes: input.notes,
          ...(input.action === 'paid' ? { paidAt: new Date() } : {}),
          ...(input.paymentMode ? { paymentMode: input.paymentMode } : {}),
        })
        .where(eq(payrollRequests.id, input.requestId));

      return { success: true };
    }),

  // ── Admin: get payroll history ─────────────────────────────────────────────
  getPayrollHistory: protectedProcedure
    .input(z.object({ employeeId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) return [];

      const base = db
        .select({
          request: payrollRequests,
          employee: { id: employees.id, name: employees.name, role: employees.role },
        })
        .from(payrollRequests)
        .innerJoin(employees, eq(payrollRequests.employeeId, employees.id))
        .orderBy(desc(payrollRequests.requestedAt));

      if (input.employeeId) {
        return base.where(eq(payrollRequests.employeeId, input.employeeId));
      }
      return base;
    }),

  // ── Admin: get employees with auth status ─────────────────────────────────────
  getEmployeesWithAuth: protectedProcedure
    .query(async ({ ctx }) => {
      if (!['admin', 'owner', 'incharge'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          employee: employees,
          auth: {
            id: employeeAuth.id,
            faceEnrolled: employeeAuth.faceEnrolled,
            faceEnrolledAt: employeeAuth.faceEnrolledAt,
            lastLoginAt: employeeAuth.lastLoginAt,
            pinSet: sql<boolean>`${employeeAuth.pinHash} IS NOT NULL`,
          }
        })
        .from(employees)
        .leftJoin(employeeAuth, eq(employees.id, employeeAuth.employeeId))
        .where(eq(employees.isActive, true))
        .orderBy(employees.id);
    }),

  // ── Employee: get own payroll requests ────────────────────────────────────────
  getMyPayrollRequests: publicProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(payrollRequests)
        .where(eq(payrollRequests.employeeId, input.employeeId))
        .orderBy(desc(payrollRequests.requestedAt))
        .limit(20);
    }),
});
