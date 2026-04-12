/**
 * Phase 2 — Comprehensive Tests
 * Covers: Employees, Attendance, Payroll Engine, Assets, Maintenance, Notifications
 */
import { describe, it, expect, beforeAll } from "vitest";
import { computePayroll as computePayslip } from "./payroll-engine";

// ─── Payroll Engine Tests ─────────────────────────────────────────────────────
describe("Payroll Engine — PF/ESI/PT computation", () => {
  it("computes correct gross salary from basic + HRA + allowances", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 1000,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: false,
    });
    expect(result.grossEarned).toBe(13000);
    expect(result.netPay).toBe(13000);
  });

  it("prorates salary correctly for partial attendance", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 0,
      daysPresent: 13, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: false,
    });
    expect(result.grossEarned).toBe(6000); // 50% of 12000
  });

  it("computes EPF employee deduction at 12% of basic (capped at ₹15000 basic)", () => {
    const result = computePayslip({
      basicSalary: 12000, hra: 2000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: false, ptApplicable: false,
    });
    // EPF = 12% of min(12000, 15000) = 1440
    expect(result.pfEmployee).toBe(1440);
    expect(result.pfEmployer).toBeCloseTo(440.4, 0); // 3.67% of 12000
    expect(result.epsEmployer).toBeCloseTo(999.6, 0); // 8.33% of 12000
  });

  it("caps EPF at ₹15000 basic — employee earning ₹25000 basic", () => {
    const result = computePayslip({
      basicSalary: 25000, hra: 5000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: false, ptApplicable: false,
    });
    // EPF capped at 15000 basic → 12% × 15000 = 1800
    expect(result.pfEmployee).toBe(1800);
    expect(result.pfEmployer).toBeCloseTo(550.5, 0); // 3.67% × 15000
    expect(result.epsEmployer).toBe(1250); // capped at ₹1250
  });

  it("computes ESI at 0.75% for gross ≤ ₹21000", () => {
    const result = computePayslip({
      basicSalary: 12000, hra: 3000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: true, ptApplicable: false,
    });
    // Gross = 15000 ≤ 21000 → ESI employee = 0.75% × 15000 = 112.5
    expect(result.esiEmployee).toBeCloseTo(112.5, 0);
    expect(result.esiEmployer).toBeCloseTo(487.5, 0); // 3.25% × 15000
  });

  it("does NOT apply ESI for gross > ₹21000", () => {
    const result = computePayslip({
      basicSalary: 18000, hra: 5000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: true, ptApplicable: false,
    });
    // Gross = 23000 > 21000 → ESI = 0
    expect(result.esiEmployee).toBe(0);
    expect(result.esiEmployer).toBe(0);
  });

  it("applies Telangana PT: ₹0 for gross ≤ ₹15000", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: true,
    });
    // Gross = 12000 ≤ 15000 → PT = 0
    expect(result.professionalTax).toBe(0);
  });

  it("applies Telangana PT: ₹150 for gross ₹15001–₹20000", () => {
    const result = computePayslip({
      basicSalary: 12000, hra: 4000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: true,
    });
    // Gross = 16000 → PT = 150
    expect(result.professionalTax).toBe(150);
  });

  it("applies Telangana PT: ₹200 for gross > ₹20000", () => {
    const result = computePayslip({
      basicSalary: 18000, hra: 5000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: true,
    });
    // Gross = 23000 > 20000 → PT = 200
    expect(result.professionalTax).toBe(200);
  });

  it("computes full deductions correctly — all applicable", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 500,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    // Gross = 12500
    // PF employee = 12% × 10000 = 1200
    // ESI employee = 0.75% × 12500 = 93.75
    // PT = 0 (gross < 15000)
    // Total deductions = 1200 + 93.75 = 1293.75
    // Net = 12500 - 1293.75 = 11206.25
    expect(result.grossEarned).toBe(12500);
    expect(result.pfEmployee).toBe(1200);
    expect(result.esiEmployee).toBeCloseTo(93.75, 0);
    expect(result.professionalTax).toBe(0);
    expect(result.netPay).toBeCloseTo(11206.25, 0);
  });

  it("handles zero attendance — zero net pay", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 0,
      daysPresent: 0, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    expect(result.grossEarned).toBe(0);
    expect(result.netPay).toBe(0);
    expect(result.pfEmployee).toBe(0);
    expect(result.esiEmployee).toBe(0);
  });

  it("handles full month attendance (26/26 days)", () => {
    const result = computePayslip({
      basicSalary: 8000, hra: 1500, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    expect(result.grossEarned).toBe(9500);
  });

  it("handles half-day as 0.5 days", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 0, otherAllowances: 0,
      daysPresent: 25.5, workingDays: 26,
      pfApplicable: false, esiApplicable: false, ptApplicable: false,
    });
    // 25.5/26 × 10000 ≈ 9807.69
    expect(result.grossEarned).toBeCloseTo(9807.69, 0);
  });

  it("employer cost is gross + employer EPF + employer ESI", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: false,
    });
    const expectedEmployerCost = result.grossEarned + result.pfEmployer + result.epsEmployer + result.esiEmployer;
    expect(result.totalEmployerCost).toBeCloseTo(expectedEmployerCost, 0);
  });
});

// ─── Payroll Engine — Edge Cases ──────────────────────────────────────────────
describe("Payroll Engine — Edge Cases", () => {
  it("does not produce negative net pay even with all deductions", () => {
    const result = computePayslip({
      basicSalary: 1000, hra: 0, otherAllowances: 0,
      daysPresent: 1, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    expect(result.netPay).toBeGreaterThanOrEqual(0);
  });

  it("handles minimum wage scenario (₹8000 basic, 26 days)", () => {
    const result = computePayslip({
      basicSalary: 8000, hra: 0, otherAllowances: 0,
      daysPresent: 26, workingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    expect(result.grossEarned).toBe(8000);
    expect(result.pfEmployee).toBe(960); // 12% × 8000
    expect(result.esiEmployee).toBeCloseTo(60, 0); // 0.75% × 8000
    expect(result.professionalTax).toBe(0); // < 15000
  });

  it("correctly handles monthly working days of 30", () => {
    const result = computePayslip({
      basicSalary: 15000, hra: 0, otherAllowances: 0,
      daysPresent: 30, workingDays: 30,
      pfApplicable: false, esiApplicable: false, ptApplicable: false,
    });
    expect(result.grossEarned).toBe(15000);
  });

  it("returns all required fields in payslip", () => {
    const result = computePayslip({
      basicSalary: 10000, hra: 2000, otherAllowances: 500,
      daysPresent: 26, monthlyWorkingDays: 26,
      pfApplicable: true, esiApplicable: true, ptApplicable: true,
    });
    expect(result).toHaveProperty("grossEarned");
    expect(result).toHaveProperty("netPay");
    expect(result).toHaveProperty("pfEmployee");
    expect(result).toHaveProperty("pfEmployer");
    expect(result).toHaveProperty("epsEmployer");
    expect(result).toHaveProperty("esiEmployee");
    expect(result).toHaveProperty("esiEmployer");
    expect(result).toHaveProperty("professionalTax");
    expect(result).toHaveProperty("totalDeductions");
    expect(result).toHaveProperty("totalEmployerCost");
    expect(result).toHaveProperty("daysPresent");
  });
});

// ─── DB-level HR Tests (require DB connection) ───────────────────────────────
describe("HR DB — Employee CRUD", () => {
  let createdEmployeeId: number;

  it("creates an employee and returns an ID", async () => {
    const { createEmployee } = await import("./db-hr");
    const emp = await createEmployee({
      name: "Test Employee",
      role: "Pump Attendant",
      department: "Operations",
      joinDate: "2025-04-01",
      basicSalary: 8000,
      hra: 1000,
      otherAllowances: 500,
      pfApplicable: true,
      esiApplicable: true,
      ptApplicable: true,
      monthlyWorkingDays: 26,
    });
    expect(emp).toHaveProperty("id");
    expect(typeof emp.id).toBe("number");
    createdEmployeeId = emp.id;
  });

  it("retrieves the created employee by ID", async () => {
    const { getEmployeeById } = await import("./db-hr");
    const emp = await getEmployeeById(createdEmployeeId);
    expect(emp).not.toBeNull();
    expect(emp?.name).toBe("Test Employee");
    expect(Number(emp?.basicSalary)).toBe(8000);
  });

  it("lists employees and includes the created one", async () => {
    const { listEmployees } = await import("./db-hr");
    const list = await listEmployees(true);
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((e: any) => e.id === createdEmployeeId);
    expect(found).toBeDefined();
  });

  it("returns null for non-existent employee ID", async () => {
    const { getEmployeeById } = await import("./db-hr");
    const emp = await getEmployeeById(999999);
    expect(emp).toBeNull();
  });

  it("updates employee salary", async () => {
    const { updateEmployee, getEmployeeById } = await import("./db-hr");
    await updateEmployee(createdEmployeeId, { basicSalary: 9000 });
    const emp = await getEmployeeById(createdEmployeeId);
    expect(Number(emp?.basicSalary)).toBe(9000);
  });

  it("deactivates employee", async () => {
    const { deactivateEmployee, getEmployeeById } = await import("./db-hr");
    await deactivateEmployee(createdEmployeeId);
    const emp = await getEmployeeById(createdEmployeeId);
    expect(emp?.isActive == 0 || emp?.isActive === false).toBe(true);
  });
});

// ─── Attendance Tests ─────────────────────────────────────────────────────────
describe("Attendance — Mark and Retrieve", () => {
  let testEmployeeId: number;

  beforeAll(async () => {
    const { createEmployee } = await import("./db-hr");
    const emp = await createEmployee({
      name: "Attendance Test Employee",
      role: "Staff",
      department: "Operations",
      joinDate: "2025-04-01",
      basicSalary: 8000,
      hra: 0,
      otherAllowances: 0,
      pfApplicable: false,
      esiApplicable: false,
      ptApplicable: false,
      monthlyWorkingDays: 26,
    });
    testEmployeeId = emp.id;
  });

  it("marks attendance as present", async () => {
    const { upsertAttendance, getAttendanceForEmployee } = await import("./db-hr");
    await upsertAttendance(testEmployeeId, "2026-03-01", "present", 0);
    const records = await getAttendanceForEmployee(testEmployeeId, 3, 2026);
    const record = records.find((r: any) => r.attendanceDate === "2026-03-01");
    expect(record?.status).toBe("present");
  });

  it("marks attendance as absent", async () => {
    const { upsertAttendance, getAttendanceForEmployee } = await import("./db-hr");
    await upsertAttendance(testEmployeeId, "2026-03-02", "absent", 0);
    const records = await getAttendanceForEmployee(testEmployeeId, 3, 2026);
    const record = records.find((r: any) => r.attendanceDate === "2026-03-02");
    expect(record?.status).toBe("absent");
  });

  it("marks attendance as half-day with 0.5 days", async () => {
    const { upsertAttendance, getAttendanceForEmployee } = await import("./db-hr");
    await upsertAttendance(testEmployeeId, "2026-03-03", "half_day", 0);
    const records = await getAttendanceForEmployee(testEmployeeId, 3, 2026);
    const record = records.find((r: any) => r.attendanceDate === "2026-03-03");
    expect(record?.status).toBe("half_day");
  });

  it("upserts — updating existing attendance record", async () => {
    const { upsertAttendance, getAttendanceForEmployee } = await import("./db-hr");
    await upsertAttendance(testEmployeeId, "2026-03-01", "absent", 0); // was present
    const records = await getAttendanceForEmployee(testEmployeeId, 3, 2026);
    const record = records.find((r: any) => r.attendanceDate === "2026-03-01");
    expect(record?.status).toBe("absent");
  });

  it("computes attendance summary correctly", async () => {
    const { getAttendanceSummary } = await import("./db-hr");
    const summary = await getAttendanceSummary(testEmployeeId, 3, 2026);
    expect(summary).toHaveProperty("present");
    expect(summary).toHaveProperty("absent");
    expect(summary).toHaveProperty("halfDay");
    expect(summary).toHaveProperty("totalDays");
    expect(summary).toHaveProperty("effectiveDays");
  });
});

// ─── Asset CRUD Tests ─────────────────────────────────────────────────────────
describe("Assets — CRUD and Health Dashboard", () => {
  let createdAssetId: number;

  it("creates an asset and returns an ID", async () => {
    const { createAsset } = await import("./db-assets");
    const asset = await createAsset({
      name: "Test Dispenser",
      category: "fuel_dispenser",
      make: "Tokheim",
      model: "Quantium 510",
      serialNo: "TK-TEST-001",
      location: "Forecourt",
      status: "operational",
      healthScore: 95,
      purchaseDate: "2020-01-01",
      purchaseCost: 250000,
    });
    expect(asset).toHaveProperty("id");
    expect(typeof asset.id).toBe("number");
    createdAssetId = asset.id;
  });

  it("retrieves the created asset by ID", async () => {
    const { getAssetById } = await import("./db-assets");
    const asset = await getAssetById(createdAssetId);
    expect(asset).not.toBeNull();
    expect(asset?.name).toBe("Test Dispenser");
    expect(asset?.healthScore).toBe(95);
  });

  it("lists assets and includes the created one", async () => {
    const { listAssets } = await import("./db-assets");
    const result = await listAssets({});
    expect(result).toHaveProperty("assets");
    const found = result.assets.find((a: any) => a.id === createdAssetId);
    expect(found).toBeDefined();
  });

  it("filters assets by category", async () => {
    const { listAssets } = await import("./db-assets");
    const result = await listAssets({ category: "fuel_dispenser" });
    const allFuelDispensers = result.assets.every((a: any) => a.category === "fuel_dispenser");
    expect(allFuelDispensers).toBe(true);
  });

  it("filters assets by status", async () => {
    const { listAssets } = await import("./db-assets");
    const result = await listAssets({ status: "operational" });
    const allOperational = result.assets.every((a: any) => a.status === "operational");
    expect(allOperational).toBe(true);
  });

  it("updates asset health score", async () => {
    const { updateAsset, getAssetById } = await import("./db-assets");
    await updateAsset(createdAssetId, { healthScore: 80, status: "under_maintenance" });
    const asset = await getAssetById(createdAssetId);
    expect(asset?.healthScore).toBe(80);
    expect(asset?.status).toBe("under_maintenance");
  });

  it("returns null for non-existent asset ID", async () => {
    const { getAssetById } = await import("./db-assets");
    const asset = await getAssetById(999999);
    expect(asset).toBeNull();
  });

  it("health dashboard returns required fields", async () => {
    const { getAssetHealthDashboard } = await import("./db-assets");
    const dashboard = await getAssetHealthDashboard();
    expect(dashboard).toHaveProperty("total");
    expect(dashboard).toHaveProperty("byStatus");
    expect(dashboard).toHaveProperty("avgHealth");
    expect(dashboard).toHaveProperty("criticalAssets");
    expect(dashboard).toHaveProperty("upcomingMaintenance");
  });

  it("deletes an asset", async () => {
    const { deleteAsset, getAssetById } = await import("./db-assets");
    await deleteAsset(createdAssetId);
    const asset = await getAssetById(createdAssetId);
    expect(asset).toBeNull();
  });
});

// ─── Maintenance Log Tests ────────────────────────────────────────────────────
describe("Maintenance Logs — Create and Retrieve", () => {
  let assetId: number;
  let logId: number;

  beforeAll(async () => {
    const { createAsset } = await import("./db-assets");
    const asset = await createAsset({
      name: "Log Test Asset",
      category: "generator",
      status: "operational",
      healthScore: 90,
    });
    assetId = asset.id;
  });

  it("creates a maintenance log", async () => {
    const { createMaintenanceLog } = await import("./db-assets");
    const log = await createMaintenanceLog({
      assetId,
      doneDate: "2026-03-15",
      maintenanceType: "Oil Change",
      description: "Changed engine oil",
      cost: 1500,
      technician: "Ravi Kumar",
      status: "completed",
    });
    expect(log).toHaveProperty("id");
    logId = log.id;
  });

  it("lists logs for an asset", async () => {
    const { listLogsForAsset } = await import("./db-assets");
    const logs = await listLogsForAsset(assetId, 10);
    expect(Array.isArray(logs)).toBe(true);
    const found = logs.find((l: any) => l.id === logId);
    expect(found).toBeDefined();
    expect(found?.maintenanceType).toBe("Oil Change");
  });

  it("returns empty array for asset with no logs", async () => {
    const { listLogsForAsset } = await import("./db-assets");
    const logs = await listLogsForAsset(999999, 10);
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBe(0);
  });
});

// ─── Notification Generation Tests ───────────────────────────────────────────
describe("Maintenance Notifications — Generation and Management", () => {
  it("generates notifications and returns structured result", async () => {
    const { generateMaintenanceNotifications } = await import("./db-assets");
    const result = await generateMaintenanceNotifications();
    expect(result).toHaveProperty("generated");
    expect(result).toHaveProperty("overdueCount");
    expect(result).toHaveProperty("dueTodayCount");
    expect(typeof result.generated).toBe("number");
    expect(result.generated).toBeGreaterThanOrEqual(0);
  });

  it("lists notifications and returns array", async () => {
    const { listNotifications } = await import("./db-assets");
    const notifications = await listNotifications(false);
    expect(Array.isArray(notifications)).toBe(true);
  });

  it("lists only unread notifications when unreadOnly=true", async () => {
    const { listNotifications } = await import("./db-assets");
    const unread = await listNotifications(true);
    const allRead = unread.every((n: any) => n.isRead === 0 || n.isRead === false);
    expect(allRead).toBe(true);
  });
});

// ─── Preloaded Assets Seed Test ───────────────────────────────────────────────
describe("Preloaded Assets — Seed", () => {
  it("seeds preloaded assets and returns count", async () => {
    const { seedPreloadedAssets, listAssets } = await import("./db-assets");
    const before = await listAssets({});
    const result = await seedPreloadedAssets();
    expect(result).toHaveProperty("seeded");
    expect(typeof result.seeded).toBe("number");
    // If already seeded, returns 0; if not, returns count
    const after = await listAssets({});
    expect(after.assets.length).toBeGreaterThanOrEqual(before.assets.length);
  });

  it("does not duplicate assets on second seed call", async () => {
    const { seedPreloadedAssets, listAssets } = await import("./db-assets");
    // Seed once to ensure preloaded assets exist
    await seedPreloadedAssets();
    const before = await listAssets({});
    // Seed again — should not add duplicates
    const result = await seedPreloadedAssets();
    const after = await listAssets({});
    expect(result.seeded).toBe(0); // Already seeded, should return 0
    expect(after.assets.length).toBe(before.assets.length); // No duplicates
  });
});
