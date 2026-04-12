/**
 * Indhan — HR, Payroll, Asset & Maintenance tRPC Routers
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  listEmployees, getEmployeeById, createEmployee, updateEmployee, deactivateEmployee,
  getAttendanceForMonth, getAttendanceForEmployee, upsertAttendance, bulkMarkAttendance,
  getAttendanceSummary,
  listPayrollRuns, getPayrollRun, processPayrollRun, getPayslipsForRun,
  getPayslipForEmployee, markPayrollPaid,
} from "./db-hr";
import {
  listAssets, getAssetById, createAsset, updateAsset, deleteAsset,
  getAssetHealthDashboard, seedPreloadedAssets,
  listSchedulesForAsset, listUpcomingSchedules, createSchedule, updateSchedule,
  listLogsForAsset, createMaintenanceLog,
  addEvidence, listEvidenceForLog, deleteEvidence,
  listNotifications, markNotificationRead, dismissNotification, generateMaintenanceNotifications,
} from "./db-assets";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";

const safeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format');

// ─── HR / Employees Router ────────────────────────────────────────────────────
export const hrRouter = router({
  // Employees
  listEmployees: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }))
    .query(({ input }) => listEmployees(input.activeOnly)),

  getEmployee: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getEmployeeById(input.id)),

  createEmployee: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(255),
      role: z.string().min(1).max(100).default("Staff"),
      department: z.enum(["Operations", "Finance", "Management", "Security", "Maintenance"]).default("Operations"),
      joinDate: safeDate,
      basicSalary: z.number().min(0).max(500000),
      hra: z.number().min(0).max(200000).default(0),
      otherAllowances: z.number().min(0).max(200000).default(0),
      pfApplicable: z.boolean().default(true),
      esiApplicable: z.boolean().default(true),
      ptApplicable: z.boolean().default(true),
      monthlyWorkingDays: z.number().int().min(1).max(31).default(26),
      phone: z.string().max(20).optional(),
      bankAccount: z.string().max(50).optional(),
      ifscCode: z.string().max(20).optional(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(({ input }) => createEmployee(input as any)),

  updateEmployee: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(255).optional(),
      role: z.string().max(100).optional(),
      department: z.enum(["Operations", "Finance", "Management", "Security", "Maintenance"]).optional(),
      basicSalary: z.number().min(0).max(500000).optional(),
      hra: z.number().min(0).max(200000).optional(),
      otherAllowances: z.number().min(0).max(200000).optional(),
      pfApplicable: z.boolean().optional(),
      esiApplicable: z.boolean().optional(),
      ptApplicable: z.boolean().optional(),
      monthlyWorkingDays: z.number().int().min(1).max(31).optional(),
      phone: z.string().max(20).optional(),
      bankAccount: z.string().max(50).optional(),
      ifscCode: z.string().max(20).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateEmployee(id, data as any);
    }),

  deactivateEmployee: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deactivateEmployee(input.id)),

  // Attendance
  getMonthAttendance: protectedProcedure
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2030) }))
    .query(({ input }) => getAttendanceForMonth(input.month, input.year)),

  getEmployeeAttendance: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2030) }))
    .query(({ input }) => getAttendanceForEmployee(input.employeeId, input.month, input.year)),

  markAttendance: protectedProcedure
    .input(z.object({
      employeeId: z.number().int().positive(),
      attendanceDate: safeDate,
      status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
      checkIn: z.string().max(8).optional(),
      checkOut: z.string().max(8).optional(),
      overtimeHours: z.number().min(0).max(12).default(0),
      notes: z.string().max(500).optional(),
      markedBy: z.string().max(100).optional(),
    }))
    .mutation(({ input }) => upsertAttendance(input as any)),

  bulkMarkAttendance: protectedProcedure
    .input(z.object({
      employeeIds: z.array(z.number().int().positive()).min(1).max(100),
      date: safeDate,
      status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
      markedBy: z.string().max(100).optional(),
    }))
    .mutation(({ input }) => bulkMarkAttendance(input.employeeIds, input.date, input.status, input.markedBy)),

  getAttendanceSummary: protectedProcedure
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2030) }))
    .query(({ input }) => getAttendanceSummary(input.month, input.year)),

  // Payroll
  listPayrollRuns: protectedProcedure.query(() => listPayrollRuns()),

  getPayrollRun: protectedProcedure
    .input(z.object({ month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2030) }))
    .query(({ input }) => getPayrollRun(input.month, input.year)),

  processPayroll: protectedProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2020).max(2030),
      approvedBy: z.string().max(100).optional(),
    }))
    .mutation(({ input }) => processPayrollRun(input.month, input.year, input.approvedBy)),

  getPayslips: protectedProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(({ input }) => getPayslipsForRun(input.runId)),

  getPayslip: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), month: z.number().int().min(1).max(12), year: z.number().int().min(2020).max(2030) }))
    .query(({ input }) => getPayslipForEmployee(input.employeeId, input.month, input.year)),

  markPayrollPaid: protectedProcedure
    .input(z.object({ runId: z.number().int().positive(), paymentDate: safeDate }))
    .mutation(({ input }) => markPayrollPaid(input.runId, input.paymentDate)),
});

// ─── Assets Router ────────────────────────────────────────────────────────────
export const assetsRouter = router({
  // Asset management
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), status: z.string().optional() }))
    .query(({ input }) => listAssets({ category: input.category, status: input.status })),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getAssetById(input.id)),

  healthDashboard: protectedProcedure.query(() => getAssetHealthDashboard()),

  seedPreloaded: protectedProcedure.mutation(() => seedPreloadedAssets()),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(255),
      category: z.enum(["fuel_dispenser", "underground_tank", "generator", "compressor", "weighbridge", "fire_safety", "cctv_security", "vehicle", "electrical", "civil", "tools_equipment", "it_equipment", "other"]),
      make: z.string().max(100).optional(),
      model: z.string().max(100).optional(),
      serialNo: z.string().max(100).optional(),
      assetTag: z.string().max(50).optional(),
      location: z.string().max(255).optional(),
      purchaseDate: safeDate.optional(),
      purchaseCost: z.number().min(0).optional(),
      currentValue: z.number().min(0).optional(),
      warrantyExpiry: safeDate.optional(),
      insuranceExpiry: safeDate.optional(),
      status: z.enum(["operational", "under_maintenance", "faulty", "decommissioned", "standby"]).default("operational"),
      healthScore: z.number().int().min(0).max(100).default(100),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(({ input }) => createAsset(input as any)),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(255).optional(),
      category: z.enum(["fuel_dispenser", "underground_tank", "generator", "compressor", "weighbridge", "fire_safety", "cctv_security", "vehicle", "electrical", "civil", "tools_equipment", "it_equipment", "other"]).optional(),
      make: z.string().max(100).optional(),
      model: z.string().max(100).optional(),
      serialNo: z.string().max(100).optional(),
      location: z.string().max(255).optional(),
      purchaseDate: safeDate.optional(),
      warrantyExpiry: safeDate.optional(),
      insuranceExpiry: safeDate.optional(),
      status: z.enum(["operational", "under_maintenance", "faulty", "decommissioned", "standby"]).optional(),
      healthScore: z.number().int().min(0).max(100).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateAsset(id, data as any);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deleteAsset(input.id)),

  // Maintenance schedules
  listSchedules: protectedProcedure
    .input(z.object({ assetId: z.number().int().positive() }))
    .query(({ input }) => listSchedulesForAsset(input.assetId)),

  upcomingSchedules: protectedProcedure
    .input(z.object({ daysAhead: z.number().int().min(1).max(90).default(30) }))
    .query(({ input }) => listUpcomingSchedules(input.daysAhead)),

  createSchedule: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
      maintenanceType: z.string().min(2).max(100),
      description: z.string().max(1000).optional(),
      frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "half_yearly", "annual", "as_needed"]),
      lastDoneDate: safeDate.optional(),
      nextDueDate: safeDate.optional(),
      estimatedCost: z.number().min(0).optional(),
      assignedTo: z.string().max(255).optional(),
    }))
    .mutation(({ input }) => createSchedule(input as any)),

  updateSchedule: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      maintenanceType: z.string().max(100).optional(),
      frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "half_yearly", "annual", "as_needed"]).optional(),
      lastDoneDate: safeDate.optional(),
      nextDueDate: safeDate.optional(),
      estimatedCost: z.number().min(0).optional(),
      assignedTo: z.string().max(255).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const { id, ...data } = input;
      return updateSchedule(id, data as any);
    }),

  // Maintenance logs
  listLogs: protectedProcedure
    .input(z.object({ assetId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(({ input }) => listLogsForAsset(input.assetId, input.limit)),

  createLog: protectedProcedure
    .input(z.object({
      assetId: z.number().int().positive(),
      scheduleId: z.number().int().positive().optional(),
      doneDate: safeDate,
      maintenanceType: z.string().min(2).max(100),
      description: z.string().max(2000).optional(),
      cost: z.number().min(0).max(10000000).default(0),
      technician: z.string().max(255).optional(),
      vendor: z.string().max(255).optional(),
      invoiceNo: z.string().max(100).optional(),
      status: z.enum(["completed", "partial", "pending"]).default("completed"),
      nextServiceDate: safeDate.optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(({ input }) => createMaintenanceLog(input as any)),

  // Evidence upload
  getUploadUrl: protectedProcedure
    .input(z.object({
      logId: z.number().int().positive(),
      assetId: z.number().int().positive(),
      fileName: z.string().max(255),
      fileType: z.enum(["image", "pdf", "document"]),
      fileBase64: z.string().max(10_000_000), // max ~7.5MB base64
      fileSizeBytes: z.number().int().min(1).max(10_000_000),
      uploadedBy: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const contentType = input.fileType === 'image' ? 'image/jpeg' : 'application/pdf';
      const suffix = Date.now().toString(36);
      const fileKey = `maintenance/${input.assetId}/${input.logId}/${suffix}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, contentType);
      const evidenceId = await addEvidence({
        logId: input.logId,
        assetId: input.assetId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileUrl: url,
        fileKey,
        fileSizeBytes: input.fileSizeBytes,
        uploadedBy: input.uploadedBy,
        notes: input.notes,
      });
      return { evidenceId, url, fileKey };
    }),

  listEvidence: protectedProcedure
    .input(z.object({ logId: z.number().int().positive() }))
    .query(({ input }) => listEvidenceForLog(input.logId)),

  deleteEvidence: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => deleteEvidence(input.id)),

  // Notifications
  listNotifications: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false) }))
    .query(({ input }) => listNotifications(input.unreadOnly)),

  markNotificationRead: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => markNotificationRead(input.id)),

  dismissNotification: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => dismissNotification(input.id)),

  generateNotifications: protectedProcedure
    .mutation(async () => {
      const result = await generateMaintenanceNotifications();
      // Send owner push notification if there are overdue or due-today items
      if (result.overdueCount > 0 || result.dueTodayCount > 0) {
        const parts: string[] = [];
        if (result.overdueCount > 0) parts.push(`${result.overdueCount} overdue`);
        if (result.dueTodayCount > 0) parts.push(`${result.dueTodayCount} due today`);
        await notifyOwner({
          title: `⚠️ Maintenance Alert — ${parts.join(', ')}`,
          content: `Indhan Asset Management: ${parts.join(' and ')} maintenance tasks require attention. Open the Assets & Equipment module to review.`,
        }).catch(() => {}); // non-blocking
      }
      return result;
    }),
});
