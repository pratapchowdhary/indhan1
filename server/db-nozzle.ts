/**
 * db-nozzle.ts — Database helpers for the Nozzle Sales & Cash Collection module
 * Pumps → Nozzles → Shift Sessions → Nozzle Readings + Cash Collections → Day Reconciliation
 */
import { and, desc, eq, sql, gte, lte } from "drizzle-orm";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import {
  pumps, nozzles, shiftSessions, nozzleReadings, cashCollections, dayReconciliations,
  employees,
} from "../drizzle/schema";

let _db: MySql2Database<Record<string, never>> | null = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    const mysql = await import("mysql2/promise");
    const pool = mysql.createPool(process.env.DATABASE_URL);
    _db = drizzle(pool) as unknown as MySql2Database<Record<string, never>>;
  }
  if (!_db) throw new Error("Database not available");
  return _db;
}

// ─── Pumps & Nozzles ──────────────────────────────────────────────────────────

export async function getAllPumpsWithNozzles() {
  const db = await getDb();
  const allPumps = await db.select().from(pumps).where(eq(pumps.isActive, true));
  const allNozzles = await db.select().from(nozzles).where(eq(nozzles.isActive, true));
  return allPumps.map(p => ({
    ...p,
    nozzles: allNozzles.filter(n => n.pumpId === p.id),
  }));
}

export async function getAllNozzles() {
  const db = await getDb();
  return db
    .select({
      id: nozzles.id,
      pumpId: nozzles.pumpId,
      nozzleNumber: nozzles.nozzleNumber,
      label: nozzles.label,
      fuelType: nozzles.fuelType,
      isActive: nozzles.isActive,
      pumpLabel: pumps.label,
      pumpNumber: pumps.pumpNumber,
    })
    .from(nozzles)
    .leftJoin(pumps, eq(nozzles.pumpId, pumps.id))
    .where(eq(nozzles.isActive, true))
    .orderBy(nozzles.nozzleNumber);
}

// ─── Shift Sessions ───────────────────────────────────────────────────────────

export async function getOrCreateShiftSession(
  shiftDate: string,
  employeeId: number,
  staffName: string,
  shiftLabel: "morning" | "evening" | "full_day" = "full_day"
) {
  const db = await getDb();
  // Check for existing open session for this employee on this date
  const existing = await db
    .select()
    .from(shiftSessions)
    .where(
      and(
        eq(shiftSessions.shiftDate, shiftDate),
        eq(shiftSessions.employeeId, employeeId),
        eq(shiftSessions.shiftLabel, shiftLabel)
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  // Create new session
  const [result] = await db.insert(shiftSessions).values({
    shiftDate,
    employeeId,
    staffName,
    shiftLabel,
    startedAt: new Date(),
    status: "open",
  });
  const inserted = await db
    .select()
    .from(shiftSessions)
    .where(eq(shiftSessions.id, (result as any).insertId))
    .limit(1);
  return inserted[0];
}

export async function getShiftSession(sessionId: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shiftSessions)
    .where(eq(shiftSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionsForDate(shiftDate: string) {
  const db = await getDb();
  return db
    .select()
    .from(shiftSessions)
    .where(eq(shiftSessions.shiftDate, shiftDate))
    .orderBy(desc(shiftSessions.createdAt));
}

export async function closeShiftSession(sessionId: number, notes?: string) {
  const db = await getDb();
  await db
    .update(shiftSessions)
    .set({ status: "closed", closedAt: new Date(), notes: notes ?? null })
    .where(eq(shiftSessions.id, sessionId));
  return getShiftSession(sessionId);
}

// ─── Nozzle Readings ──────────────────────────────────────────────────────────

export async function getReadingsForSession(sessionId: number) {
  const db = await getDb();
  return db
    .select({
      id: nozzleReadings.id,
      sessionId: nozzleReadings.sessionId,
      nozzleId: nozzleReadings.nozzleId,
      readingType: nozzleReadings.readingType,
      meterReading: nozzleReadings.meterReading,
      recordedAt: nozzleReadings.recordedAt,
      recordedBy: nozzleReadings.recordedBy,
      notes: nozzleReadings.notes,
      nozzleLabel: nozzles.label,
      fuelType: nozzles.fuelType,
      nozzleNumber: nozzles.nozzleNumber,
    })
    .from(nozzleReadings)
    .leftJoin(nozzles, eq(nozzleReadings.nozzleId, nozzles.id))
    .where(eq(nozzleReadings.sessionId, sessionId))
    .orderBy(nozzleReadings.nozzleId, nozzleReadings.readingType);
}

export async function upsertNozzleReading(data: {
  sessionId: number;
  nozzleId: number;
  readingType: "opening" | "closing";
  meterReading: number;
  recordedBy?: string;
  notes?: string;
}) {
  const db = await getDb();
  // Check if reading already exists for this session+nozzle+type
  const existing = await db
    .select()
    .from(nozzleReadings)
    .where(
      and(
        eq(nozzleReadings.sessionId, data.sessionId),
        eq(nozzleReadings.nozzleId, data.nozzleId),
        eq(nozzleReadings.readingType, data.readingType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    await db
      .update(nozzleReadings)
      .set({
        meterReading: String(data.meterReading),
        recordedBy: data.recordedBy ?? null,
        notes: data.notes ?? null,
        recordedAt: new Date(),
      })
      .where(eq(nozzleReadings.id, existing[0].id));
    return { ...existing[0], meterReading: String(data.meterReading) };
  }

  // Insert new
  const [result] = await db.insert(nozzleReadings).values({
    sessionId: data.sessionId,
    nozzleId: data.nozzleId,
    readingType: data.readingType,
    meterReading: String(data.meterReading),
    recordedBy: data.recordedBy ?? null,
    notes: data.notes ?? null,
    recordedAt: new Date(),
  });
  const inserted = await db
    .select()
    .from(nozzleReadings)
    .where(eq(nozzleReadings.id, (result as any).insertId))
    .limit(1);
  return inserted[0];
}

// ─── Cash Collections ─────────────────────────────────────────────────────────

export async function getCollectionsForSession(sessionId: number) {
  const db = await getDb();
  return db
    .select()
    .from(cashCollections)
    .where(eq(cashCollections.sessionId, sessionId))
    .orderBy(desc(cashCollections.collectionTime));
}

export async function addCashCollection(data: {
  sessionId: number;
  nozzleId?: number;
  amount: number;
  paymentMode: "cash" | "card" | "online" | "credit";
  customerId?: number;
  customerName?: string;
  notes?: string;
  recordedBy?: string;
}) {
  const db = await getDb();
  const [result] = await db.insert(cashCollections).values({
    sessionId: data.sessionId,
    nozzleId: data.nozzleId ?? null,
    amount: String(data.amount),
    paymentMode: data.paymentMode,
    customerId: data.customerId ?? null,
    customerName: data.customerName ?? null,
    notes: data.notes ?? null,
    recordedBy: data.recordedBy ?? null,
    collectionTime: new Date(),
  });
  const inserted = await db
    .select()
    .from(cashCollections)
    .where(eq(cashCollections.id, (result as any).insertId))
    .limit(1);
  return inserted[0];
}

export async function deleteCashCollection(id: number) {
  const db = await getDb();
  await db.delete(cashCollections).where(eq(cashCollections.id, id));
}

// ─── Session Summary ──────────────────────────────────────────────────────────

export async function getSessionSummary(sessionId: number) {
  const db = await getDb();

  const readings = await getReadingsForSession(sessionId);
  const collections = await getCollectionsForSession(sessionId);

  // Compute volume dispensed per nozzle (closing - opening)
  const nozzleMap = new Map<number, { opening?: number; closing?: number; fuelType?: string; label?: string; nozzleNumber?: number }>();
  for (const r of readings) {
    const nid = r.nozzleId;
    if (!nozzleMap.has(nid)) nozzleMap.set(nid, { fuelType: r.fuelType ?? undefined, label: r.nozzleLabel ?? undefined, nozzleNumber: r.nozzleNumber ?? undefined });
    const entry = nozzleMap.get(nid)!;
    if (r.readingType === "opening") entry.opening = Number(r.meterReading);
    if (r.readingType === "closing") entry.closing = Number(r.meterReading);
  }

  let totalPetrolLitres = 0;
  let totalDieselLitres = 0;
  const nozzleSummaries = [];

  for (const [nid, data] of Array.from(nozzleMap.entries())) {
    const dispensed = (data.closing !== undefined && data.opening !== undefined)
      ? Math.max(0, data.closing - data.opening)
      : null;
    if (dispensed !== null) {
      if (data.fuelType === "petrol") totalPetrolLitres += dispensed;
      if (data.fuelType === "diesel") totalDieselLitres += dispensed;
    }
    nozzleSummaries.push({
      nozzleId: nid,
      nozzleNumber: data.nozzleNumber,
      label: data.label,
      fuelType: data.fuelType,
      opening: data.opening ?? null,
      closing: data.closing ?? null,
      dispensed,
    });
  }

  // Compute collection totals
  let totalCash = 0, totalCard = 0, totalOnline = 0, totalCredit = 0;
  for (const c of collections) {
    const amt = Number(c.amount);
    if (c.paymentMode === "cash")   totalCash   += amt;
    if (c.paymentMode === "card")   totalCard   += amt;
    if (c.paymentMode === "online") totalOnline += amt;
    if (c.paymentMode === "credit") totalCredit += amt;
  }
  const totalCollected = totalCash + totalCard + totalOnline + totalCredit;

  // Compute expected sales value from volumes
  const PETROL_PRICE = 103.41; // ₹/L (approximate retail price)
  const DIESEL_PRICE = 89.14;  // ₹/L
  const expectedSalesValue = totalPetrolLitres * PETROL_PRICE + totalDieselLitres * DIESEL_PRICE;
  const variance = totalCollected - expectedSalesValue;

  return {
    sessionId,
    nozzleSummaries: nozzleSummaries.sort((a, b) => (a.nozzleNumber ?? 0) - (b.nozzleNumber ?? 0)),
    totalPetrolLitres,
    totalDieselLitres,
    totalCash,
    totalCard,
    totalOnline,
    totalCredit,
    totalCollected,
    expectedSalesValue,
    variance,
    collections,
  };
}

// ─── Day Reconciliation ───────────────────────────────────────────────────────

export async function computeDayReconciliation(shiftDate: string) {
  const db = await getDb();
  const sessions = await getSessionsForDate(shiftDate);

  let totalPetrol = 0, totalDiesel = 0;
  let totalCash = 0, totalCard = 0, totalOnline = 0, totalCredit = 0;

  for (const session of sessions) {
    const summary = await getSessionSummary(session.id);
    totalPetrol  += summary.totalPetrolLitres;
    totalDiesel  += summary.totalDieselLitres;
    totalCash    += summary.totalCash;
    totalCard    += summary.totalCard;
    totalOnline  += summary.totalOnline;
    totalCredit  += summary.totalCredit;
  }

  const PETROL_PRICE = 103.41;
  const DIESEL_PRICE = 89.14;
  const totalSalesValue = totalPetrol * PETROL_PRICE + totalDiesel * DIESEL_PRICE;
  const totalCollected = totalCash + totalCard + totalOnline + totalCredit;
  const variance = totalCollected - totalSalesValue;
  const status = Math.abs(variance) < 1 ? "balanced" : (Math.abs(variance) < 500 ? "balanced" : "discrepancy");

  // Upsert day reconciliation record
  const existing = await db
    .select()
    .from(dayReconciliations)
    .where(eq(dayReconciliations.reconcileDate, shiftDate))
    .limit(1);

  const recData = {
    totalPetrolLitres: String(totalPetrol.toFixed(2)),
    totalDieselLitres: String(totalDiesel.toFixed(2)),
    totalSalesValue: String(totalSalesValue.toFixed(2)),
    totalCashCollected: String(totalCash.toFixed(2)),
    totalCardCollected: String(totalCard.toFixed(2)),
    totalOnlineCollected: String(totalOnline.toFixed(2)),
    totalCreditSales: String(totalCredit.toFixed(2)),
    variance: String(variance.toFixed(2)),
    status: status as "pending" | "balanced" | "discrepancy",
  };

  if (existing.length > 0) {
    await db.update(dayReconciliations).set(recData).where(eq(dayReconciliations.reconcileDate, shiftDate));
    return { ...existing[0], ...recData };
  } else {
    const [result] = await db.insert(dayReconciliations).values({ reconcileDate: shiftDate, ...recData });
    const inserted = await db
      .select()
      .from(dayReconciliations)
      .where(eq(dayReconciliations.id, (result as any).insertId))
      .limit(1);
    return inserted[0];
  }
}

export async function getDayReconciliation(shiftDate: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(dayReconciliations)
    .where(eq(dayReconciliations.reconcileDate, shiftDate))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentDayReconciliations(limit = 30) {
  const db = await getDb();
  return db
    .select()
    .from(dayReconciliations)
    .orderBy(desc(dayReconciliations.reconcileDate))
    .limit(limit);
}

export async function getEmployeesForNozzle() {
  const db = await getDb();
  return db
    .select({ id: employees.id, name: employees.name, role: employees.role })
    .from(employees)
    .where(eq(employees.isActive, true));
}

// ─── Auto-populate daily_reports from nozzle data ────────────────────────────
// Called automatically when a shift is closed. Merges all session data for the
// day into the daily_reports table so the Reconciliation page can pre-fill.

import { dailyReports } from "../drizzle/schema";

export async function autoPopulateDailyReport(shiftDate: string) {
  const db = await getDb();
  const sessions = await getSessionsForDate(shiftDate);
  if (sessions.length === 0) return null;

  let totalPetrol = 0, totalDiesel = 0;
  let totalCash = 0, totalCard = 0, totalOnline = 0, totalCredit = 0;

  for (const session of sessions) {
    const summary = await getSessionSummary(session.id);
    totalPetrol  += summary.totalPetrolLitres;
    totalDiesel  += summary.totalDieselLitres;
    totalCash    += summary.totalCash;
    totalCard    += summary.totalCard;
    totalOnline  += summary.totalOnline;
    totalCredit  += summary.totalCredit;
  }

  const PETROL_PRICE = 103.41;
  const DIESEL_PRICE = 89.14;
  const totalSalesValue = totalPetrol * PETROL_PRICE + totalDiesel * DIESEL_PRICE;
  const totalCollected = totalCash + totalCard + totalOnline + totalCredit;

  // Compute gross profit using fixed margins
  const PETROL_MARGIN = 3.95;
  const DIESEL_MARGIN = 2.49;
  const grossProfit = totalPetrol * PETROL_MARGIN + totalDiesel * DIESEL_MARGIN;

  const updateData = {
    petrolSalesQty: String(totalPetrol.toFixed(3)),
    dieselSalesQty: String(totalDiesel.toFixed(3)),
    totalSalesValue: String(totalSalesValue.toFixed(2)),
    cashCollected: String(totalCash.toFixed(2)),
    cardCollected: String(totalCard.toFixed(2)),
    onlineCollected: String(totalOnline.toFixed(2)),
    creditSales: String(totalCredit.toFixed(2)),
    totalCollected: String(totalCollected.toFixed(2)),
    grossProfit: String(grossProfit.toFixed(2)),
  };

  // Upsert into daily_reports
  const existing = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.reportDate, shiftDate))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(dailyReports)
      .set(updateData)
      .where(eq(dailyReports.reportDate, shiftDate));
  } else {
    await db.insert(dailyReports).values({
      reportDate: shiftDate,
      ...updateData,
      reconciliationStatus: "pending",
    });
  }

  return { shiftDate, totalPetrol, totalDiesel, totalSalesValue, totalCollected, grossProfit };
}
