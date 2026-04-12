/**
 * Indhan — Asset Tracking & Maintenance DB Helpers
 */
import { eq, and, gte, lte, desc, asc, sql, lte as lteFn, or } from "drizzle-orm";
import {
  assets, InsertAsset,
  maintenanceSchedules, InsertMaintenanceSchedule,
  maintenanceLogs, InsertMaintenanceLog,
  maintenanceEvidence, InsertMaintenanceEvidence,
  maintenanceNotifications,
} from "../drizzle/schema";
import { getDb } from "./db";
import { computeNextDueDate } from "./payroll-engine";

// ─── Standard Gas Station Asset Preload ──────────────────────────────────────

export const PRELOADED_ASSETS: Omit<InsertAsset, 'id' | 'createdAt' | 'updatedAt'>[] = [
  // Fuel Dispensers
  { name: "Petrol Dispenser — Nozzle 1", category: "fuel_dispenser", make: "Tokheim", model: "TQM510", location: "Forecourt Bay 1", status: "operational", healthScore: 90, isPreloaded: true },
  { name: "Petrol Dispenser — Nozzle 2", category: "fuel_dispenser", make: "Tokheim", model: "TQM510", location: "Forecourt Bay 1", status: "operational", healthScore: 88, isPreloaded: true },
  { name: "Diesel Dispenser — Nozzle 3", category: "fuel_dispenser", make: "Gilbarco", model: "Encore 700", location: "Forecourt Bay 2", status: "operational", healthScore: 92, isPreloaded: true },
  { name: "Diesel Dispenser — Nozzle 4", category: "fuel_dispenser", make: "Gilbarco", model: "Encore 700", location: "Forecourt Bay 2", status: "operational", healthScore: 85, isPreloaded: true },
  // Underground Storage Tanks
  { name: "Petrol UST — 20KL", category: "underground_tank", make: "Fibre Glass", model: "FRP-20000", location: "Underground — Bay 1", status: "operational", healthScore: 95, isPreloaded: true },
  { name: "Diesel UST — 30KL", category: "underground_tank", make: "Fibre Glass", model: "FRP-30000", location: "Underground — Bay 2", status: "operational", healthScore: 95, isPreloaded: true },
  // Generator
  { name: "DG Set — 25 KVA", category: "generator", make: "Kirloskar", model: "KG1-25AS", location: "Generator Room", status: "operational", healthScore: 80, isPreloaded: true },
  // Compressor
  { name: "Air Compressor", category: "compressor", make: "Elgi", model: "TS10", location: "Air Filling Bay", status: "operational", healthScore: 75, isPreloaded: true },
  // Weighbridge
  { name: "Weighbridge — 60T", category: "weighbridge", make: "Essae", model: "WB-60T", location: "Entry Gate", status: "operational", healthScore: 90, isPreloaded: true },
  // Fire Safety
  { name: "Fire Extinguisher — ABC (x4)", category: "fire_safety", make: "Minimax", model: "ABC-6KG", location: "Forecourt / Office", status: "operational", healthScore: 100, isPreloaded: true },
  { name: "Automatic Fire Suppression System", category: "fire_safety", make: "Hochiki", model: "FX-2000", location: "Pump Room", status: "operational", healthScore: 95, isPreloaded: true },
  // CCTV
  { name: "CCTV System — 8 Cameras", category: "cctv_security", make: "Hikvision", model: "DS-7208HGHI", location: "All Areas", status: "operational", healthScore: 85, isPreloaded: true },
  // Vehicles
  { name: "Fuel Tanker — 10KL (Hired)", category: "vehicle", make: "Ashok Leyland", model: "2518", location: "Forecourt", status: "operational", healthScore: 70, isPreloaded: true },
  // Electrical
  { name: "Main LT Panel", category: "electrical", make: "L&T", model: "MCC-Panel", location: "Electrical Room", status: "operational", healthScore: 90, isPreloaded: true },
  { name: "UPS System — 5 KVA", category: "electrical", make: "APC", model: "Smart-UPS 5000", location: "Office", status: "operational", healthScore: 80, isPreloaded: true },
  // IT Equipment
  { name: "POS Terminal", category: "it_equipment", make: "Verifone", model: "VX520", location: "Cashier Counter", status: "operational", healthScore: 95, isPreloaded: true },
  { name: "Office Computer", category: "it_equipment", make: "Dell", model: "OptiPlex 3080", location: "Office", status: "operational", healthScore: 90, isPreloaded: true },
];

export async function seedPreloadedAssets() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(assets).where(eq(assets.isPreloaded, true));
  if (existing.length > 0) return { seeded: 0, message: "Preloaded assets already exist" };
  for (const asset of PRELOADED_ASSETS) {
    await db.insert(assets).values(asset as InsertAsset);
  }
  return { seeded: PRELOADED_ASSETS.length };
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function listAssets(opts: { category?: string; status?: string } = {}) {
  const db = await getDb();
  if (!db) return { assets: [], summary: {} };
  let query = db.select().from(assets);
  const conditions = [];
  if (opts.category && opts.category.trim() !== '') conditions.push(eq(assets.category, opts.category as any));
  if (opts.status && opts.status.trim() !== '') conditions.push(eq(assets.status, opts.status as any));
  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(asc(assets.category), asc(assets.name))
    : await query.orderBy(asc(assets.category), asc(assets.name));
  return { assets: rows, summary: {} };
}

export async function getAssetById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createAsset(data: InsertAsset) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(assets).values(data);
  const insertId = (result[0] as any).insertId as number;
  return { id: insertId, ...data };
}

export async function updateAsset(id: number, data: Partial<InsertAsset>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(assets).set(data).where(eq(assets.id, id));
  return getAssetById(id);
}

export async function deleteAsset(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(assets).where(eq(assets.id, id));
}

export async function getAssetHealthDashboard() {
  const db = await getDb();
  if (!db) return { assets: [], summary: {} };
  const rows = await db.execute(sql`
    SELECT
      a.*,
      COUNT(DISTINCT ms.id) AS scheduleCount,
      COUNT(DISTINCT CASE WHEN ms.nextDueDate <= DATE_FORMAT(NOW(), '%Y-%m-%d') AND ms.isActive = 1 THEN ms.id END) AS overdueCount,
      COUNT(DISTINCT CASE WHEN ms.nextDueDate BETWEEN DATE_FORMAT(NOW(), '%Y-%m-%d') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 7 DAY), '%Y-%m-%d') AND ms.isActive = 1 THEN ms.id END) AS dueSoonCount,
      MAX(ml.doneDate) AS lastMaintenanceDate
    FROM assets a
    LEFT JOIN maintenance_schedules ms ON ms.assetId = a.id
    LEFT JOIN maintenance_logs ml ON ml.assetId = a.id
    GROUP BY a.id
    ORDER BY a.healthScore ASC, a.category ASC
  `);
  const assetList = rows[0] as unknown as any[];
  const total = assetList.length;
  const byStatus = {
    operational: assetList.filter(a => a.status === 'operational').length,
    under_maintenance: assetList.filter(a => a.status === 'under_maintenance').length,
    faulty: assetList.filter(a => a.status === 'faulty').length,
    decommissioned: assetList.filter(a => a.status === 'decommissioned').length,
  };
  const avgHealth = total > 0
    ? Math.round(assetList.reduce((s, a) => s + (a.healthScore ?? 0), 0) / total)
    : 0;
  const criticalAssets = assetList.filter(a => (a.healthScore ?? 100) < 50 || a.status === 'faulty');
  const upcomingMaintenance = assetList.filter(a => Number(a.dueSoonCount) > 0 || Number(a.overdueCount) > 0);
  return { assets: assetList, total, byStatus, avgHealth, criticalAssets, upcomingMaintenance };
}

// ─── Maintenance Schedules ────────────────────────────────────────────────────

export async function listSchedulesForAsset(assetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(maintenanceSchedules)
    .where(and(eq(maintenanceSchedules.assetId, assetId), eq(maintenanceSchedules.isActive, true)))
    .orderBy(asc(maintenanceSchedules.nextDueDate));
}

export async function listUpcomingSchedules(daysAhead = 30) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
  const rows = await db.execute(sql`
    SELECT ms.*, a.name AS assetName, a.category AS assetCategory, a.status AS assetStatus
    FROM maintenance_schedules ms
    JOIN assets a ON a.id = ms.assetId
    WHERE ms.isActive = 1 AND ms.nextDueDate <= ${future}
    ORDER BY ms.nextDueDate ASC
  `);
  return rows[0] as unknown as any[];
}

export async function createSchedule(data: InsertMaintenanceSchedule) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Auto-compute nextDueDate if lastDoneDate is provided
  if (data.lastDoneDate && data.frequency && !data.nextDueDate) {
    data.nextDueDate = computeNextDueDate(data.lastDoneDate, data.frequency);
  }
  const result = await db.insert(maintenanceSchedules).values(data);
  return (result[0] as any).insertId;
}

export async function updateSchedule(id: number, data: Partial<InsertMaintenanceSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.lastDoneDate && data.frequency && !data.nextDueDate) {
    data.nextDueDate = computeNextDueDate(data.lastDoneDate, data.frequency);
  }
  await db.update(maintenanceSchedules).set(data).where(eq(maintenanceSchedules.id, id));
}

// ─── Maintenance Logs ─────────────────────────────────────────────────────────

export async function listLogsForAsset(assetId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  // Use Drizzle ORM query to avoid raw SQL parameter binding issues
  const logs = await db
    .select()
    .from(maintenanceLogs)
    .where(eq(maintenanceLogs.assetId, assetId))
    .orderBy(desc(maintenanceLogs.doneDate))
    .limit(limit);
  // Attach evidence for each log
  const result = await Promise.all(logs.map(async (log) => {
    const evidence = await db
      .select()
      .from(maintenanceEvidence)
      .where(eq(maintenanceEvidence.logId, log.id))
      .orderBy(asc(maintenanceEvidence.id));
    return { ...log, evidence };
  }));
  return result;
}

export async function createMaintenanceLog(data: InsertMaintenanceLog) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(maintenanceLogs).values(data);
  const logId = (result[0] as any).insertId;

  // Update the linked schedule's lastDoneDate and compute next due
  if (data.scheduleId) {
    const schedule = await db.select().from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, data.scheduleId)).limit(1);
    if (schedule.length > 0) {
      const nextDue = computeNextDueDate(data.doneDate, schedule[0].frequency);
      await db.update(maintenanceSchedules).set({
        lastDoneDate: data.doneDate,
        nextDueDate: nextDue,
      }).where(eq(maintenanceSchedules.id, data.scheduleId));
    }
  }

  // Update asset health score and status
  if (data.status === 'completed') {
    await db.update(assets).set({
      status: 'operational',
      healthScore: sql`LEAST(healthScore + 5, 100)`,
    }).where(eq(assets.id, data.assetId));
  }

  return { id: logId as number, ...data };
}

// ─── Maintenance Evidence ─────────────────────────────────────────────────────

export async function addEvidence(data: InsertMaintenanceEvidence) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(maintenanceEvidence).values(data);
  return (result[0] as any).insertId;
}

export async function listEvidenceForLog(logId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(maintenanceEvidence)
    .where(eq(maintenanceEvidence.logId, logId))
    .orderBy(asc(maintenanceEvidence.createdAt));
}

export async function deleteEvidence(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db.select().from(maintenanceEvidence).where(eq(maintenanceEvidence.id, id)).limit(1);
  if (rows.length === 0) return null;
  await db.delete(maintenanceEvidence).where(eq(maintenanceEvidence.id, id));
  return rows[0].fileKey;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function generateMaintenanceNotifications() {
  const db = await getDb();
  if (!db) return { generated: 0, overdueCount: 0, dueTodayCount: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Get overdue schedules
  const overdueRows = await db.execute(sql`
    SELECT ms.*, a.name AS assetName
    FROM maintenance_schedules ms
    JOIN assets a ON a.id = ms.assetId
    WHERE ms.isActive = 1 AND ms.nextDueDate < ${today}
  `);
  const overdue = overdueRows[0] as unknown as any[];

  // Get upcoming (within 7 days)
  const upcomingRows = await db.execute(sql`
    SELECT ms.*, a.name AS assetName
    FROM maintenance_schedules ms
    JOIN assets a ON a.id = ms.assetId
    WHERE ms.isActive = 1 AND ms.nextDueDate BETWEEN ${today} AND ${in7Days}
  `);
  const upcoming = upcomingRows[0] as unknown as any[];

  let count = 0;
  for (const s of overdue) {
    await db.insert(maintenanceNotifications).values({
      assetId: s.assetId,
      scheduleId: s.id,
      type: 'overdue',
      title: `Overdue: ${s.maintenanceType} — ${s.assetName}`,
      message: `Scheduled for ${s.nextDueDate}. Now overdue.`,
      dueDate: s.nextDueDate,
    });
    count++;
  }
  for (const s of upcoming) {
    await db.insert(maintenanceNotifications).values({
      assetId: s.assetId,
      scheduleId: s.id,
      type: 'upcoming',
      title: `Due Soon: ${s.maintenanceType} — ${s.assetName}`,
      message: `Scheduled for ${s.nextDueDate}.`,
      dueDate: s.nextDueDate,
    });
    count++;
  }
  return { generated: count, overdueCount: overdue.length, dueTodayCount: upcoming.filter((s: any) => s.nextDueDate === today).length };
}

export async function listNotifications(unreadOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT mn.*, a.name AS assetName, a.category AS assetCategory
    FROM maintenance_notifications mn
    JOIN assets a ON a.id = mn.assetId
    WHERE mn.isDismissed = 0
    ${unreadOnly ? sql`AND mn.isRead = 0` : sql``}
    ORDER BY mn.createdAt DESC
    LIMIT 50
  `);
  return rows[0] as unknown as any[];
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(maintenanceNotifications).set({ isRead: true }).where(eq(maintenanceNotifications.id, id));
}

export async function dismissNotification(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(maintenanceNotifications).set({ isDismissed: true }).where(eq(maintenanceNotifications.id, id));
}
