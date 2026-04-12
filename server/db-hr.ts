/**
 * Indhan — HR, Payroll & Attendance DB Helpers
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import {
  employees, InsertEmployee,
  attendance, InsertAttendance,
  payrollRuns, InsertPayrollRun,
  payslips, InsertPayslip,
} from "../drizzle/schema";
import { getDb } from "./db";
import { computePayroll } from "./payroll-engine";

// ─── Employees ────────────────────────────────────────────────────────────────

export async function listEmployees(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const rows = activeOnly
    ? await db.select().from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name))
    : await db.select().from(employees).orderBy(asc(employees.name));
  return rows;
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(employees).values(data);
  const insertId = (result[0] as any).insertId;
  return { id: insertId as number, ...data };
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(employees).set(data).where(eq(employees.id, id));
  return getEmployeeById(id);
}

export async function deactivateEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getAttendanceForMonth(month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = await db.select().from(attendance)
    .where(and(gte(attendance.attendanceDate, startDate), lte(attendance.attendanceDate, endDate)))
    .orderBy(asc(attendance.attendanceDate), asc(attendance.employeeId));
  return rows;
}

export async function getAttendanceForEmployee(employeeId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = await db.select().from(attendance)
    .where(and(
      eq(attendance.employeeId, employeeId),
      gte(attendance.attendanceDate, startDate),
      lte(attendance.attendanceDate, endDate)
    ))
    .orderBy(asc(attendance.attendanceDate));
  return rows;
}

export async function upsertAttendance(
  employeeIdOrData: number | InsertAttendance,
  attendanceDate?: string,
  status?: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday',
  overtimeHours?: number,
  markedBy?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Support both positional args and object form
  const data: InsertAttendance = typeof employeeIdOrData === 'object'
    ? employeeIdOrData
    : { employeeId: employeeIdOrData, attendanceDate: attendanceDate!, status: status!, overtimeHours: String(overtimeHours ?? 0), markedBy };
  // Check if record exists for this employee+date
  const existing = await db.select().from(attendance)
    .where(and(eq(attendance.employeeId, data.employeeId!), eq(attendance.attendanceDate, data.attendanceDate!)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(attendance).set(data).where(eq(attendance.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(attendance).values(data);
    return (result[0] as any).insertId;
  }
}

export async function bulkMarkAttendance(
  employeeIds: number[],
  date: string,
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday',
  markedBy?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  for (const empId of employeeIds) {
    await upsertAttendance({ employeeId: empId, attendanceDate: date, status, markedBy });
  }
  return { marked: employeeIds.length };
}

/**
 * Compute attendance summary for a month — returns daysPresent per employee
 * half_day counts as 0.5, present = 1, absent/leave = 0
 */
export async function getAttendanceSummary(employeeIdOrMonth: number, monthOrYear: number, year?: number) {
  // Overload: if 3 args, first is employeeId; if 2 args, first is month
  if (year !== undefined) {
    // Called as getAttendanceSummary(employeeId, month, year)
    return getAttendanceSummaryForEmployee(employeeIdOrMonth, monthOrYear, year);
  }
  return getAttendanceSummaryForMonth(employeeIdOrMonth, monthOrYear);
}

async function getAttendanceSummaryForEmployee(employeeId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return { present: 0, absent: 0, halfDay: 0, totalDays: 0, effectiveDays: 0 };
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.employeeId, employeeId),
        gte(attendance.attendanceDate, startDate),
        lte(attendance.attendanceDate, endDate)
      )
    );
  const present = rows.filter((r: any) => r.status === 'present').length;
  const absent = rows.filter((r: any) => r.status === 'absent').length;
  const halfDay = rows.filter((r: any) => r.status === 'half_day').length;
  const totalDays = rows.length;
  const effectiveDays = present + halfDay * 0.5;
  return { present, absent, halfDay, totalDays, effectiveDays };
}

async function getAttendanceSummaryForMonth(month: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = await db.execute(sql`
    SELECT
      a.employeeId,
      e.name AS employeeName,
      e.role,
      e.basicSalary,
      e.hra,
      e.otherAllowances,
      e.pfApplicable,
      e.esiApplicable,
      e.ptApplicable,
      e.monthlyWorkingDays,
      SUM(CASE
        WHEN a.status = 'present' THEN 1
        WHEN a.status = 'half_day' THEN 0.5
        ELSE 0
      END) AS daysPresent,
      COUNT(*) AS recordCount
    FROM attendance a
    JOIN employees e ON e.id = a.employeeId
    WHERE a.attendanceDate BETWEEN ${startDate} AND ${endDate}
      AND e.isActive = true
    GROUP BY a.employeeId, e.name, e.role, e.basicSalary, e.hra, e.otherAllowances,
             e.pfApplicable, e.esiApplicable, e.ptApplicable, e.monthlyWorkingDays
    ORDER BY e.name
  `);
  return (rows[0] as unknown as any[]);
}

// ─── Payroll Runs ─────────────────────────────────────────────────────────────

export async function listPayrollRuns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payrollRuns).orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
}

export async function getPayrollRun(month: number, year: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.month, month), eq(payrollRuns.year, year)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Run payroll for a given month — computes all payslips from attendance data
 * Returns the payroll run with all computed payslips
 */
export async function processPayrollRun(month: number, year: number, approvedBy?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Check if run already exists
  let run = await getPayrollRun(month, year);
  if (run && run.status === 'paid') {
    throw new Error(`Payroll for ${month}/${year} is already paid and locked.`);
  }

  // Get attendance summary
  const summaryResult = await getAttendanceSummary(month, year);
  const summary = summaryResult as any[];

  // Also get employees with no attendance records (treat as absent)
  const allEmployees = await listEmployees(true);
  const attendedIds = new Set(summary.map((r: any) => r.employeeId));
  const absentEmployees = allEmployees.filter(e => !attendedIds.has(e.id));

  // Build payslip data for all employees
  const payslipData: InsertPayslip[] = [];
  let totals = { gross: 0, pfEmp: 0, pfEmpr: 0, esiEmp: 0, esiEmpr: 0, pt: 0, net: 0 };

  // Process employees with attendance records
  for (const row of summary) {
    const result = computePayroll({
      basicSalary: Number(row.basicSalary),
      hra: Number(row.hra),
      otherAllowances: Number(row.otherAllowances),
      workingDays: Number(row.monthlyWorkingDays) || 26,
      daysPresent: Number(row.daysPresent),
      pfApplicable: Boolean(row.pfApplicable),
      esiApplicable: Boolean(row.esiApplicable),
      ptApplicable: Boolean(row.ptApplicable),
    });
    payslipData.push({
      runId: 0, // will be set after run is created
      employeeId: row.employeeId,
      month, year,
      workingDays: Number(row.monthlyWorkingDays) || 26,
      daysPresent: String(Number(row.daysPresent).toFixed(1)) as any,
      basicSalary: String(result.basicEarned) as any,
      hra: String(result.hraEarned) as any,
      otherAllowances: String(result.otherAllowancesEarned) as any,
      grossEarned: String(result.grossEarned) as any,
      pfEmployee: String(result.pfEmployee) as any,
      esiEmployee: String(result.esiEmployee) as any,
      professionalTax: String(result.professionalTax) as any,
      otherDeductions: '0.00' as any,
      totalDeductions: String(result.totalDeductions) as any,
      pfEmployer: String(result.pfEmployer + result.epsEmployer) as any,
      esiEmployer: String(result.esiEmployer) as any,
      netPay: String(result.netPay) as any,
    });
    totals.gross += result.grossEarned;
    totals.pfEmp += result.pfEmployee;
    totals.pfEmpr += result.pfEmployer + result.epsEmployer;
    totals.esiEmp += result.esiEmployee;
    totals.esiEmpr += result.esiEmployer;
    totals.pt += result.professionalTax;
    totals.net += result.netPay;
  }

  // Process absent employees (zero pay)
  for (const emp of absentEmployees) {
    payslipData.push({
      runId: 0,
      employeeId: emp.id,
      month, year,
      workingDays: emp.monthlyWorkingDays ?? 26,
      daysPresent: '0.0' as any,
      basicSalary: '0.00' as any,
      hra: '0.00' as any,
      otherAllowances: '0.00' as any,
      grossEarned: '0.00' as any,
      pfEmployee: '0.00' as any,
      esiEmployee: '0.00' as any,
      professionalTax: '0.00' as any,
      otherDeductions: '0.00' as any,
      totalDeductions: '0.00' as any,
      pfEmployer: '0.00' as any,
      esiEmployer: '0.00' as any,
      netPay: '0.00' as any,
    });
  }

  // Create or update the payroll run
  const runData: InsertPayrollRun = {
    month, year,
    status: 'processed',
    totalGross: String(Math.round(totals.gross * 100) / 100) as any,
    totalPfEmployee: String(Math.round(totals.pfEmp * 100) / 100) as any,
    totalPfEmployer: String(Math.round(totals.pfEmpr * 100) / 100) as any,
    totalEsiEmployee: String(Math.round(totals.esiEmp * 100) / 100) as any,
    totalEsiEmployer: String(Math.round(totals.esiEmpr * 100) / 100) as any,
    totalPt: String(Math.round(totals.pt * 100) / 100) as any,
    totalNetPay: String(Math.round(totals.net * 100) / 100) as any,
    processedAt: new Date(),
    approvedBy,
  };

  let runId: number;
  if (run) {
    await db.update(payrollRuns).set(runData).where(eq(payrollRuns.id, run.id));
    runId = run.id;
    // Delete existing payslips for this run
    await db.delete(payslips).where(eq(payslips.runId, runId));
  } else {
    const insertResult = await db.insert(payrollRuns).values(runData);
    runId = (insertResult[0] as any).insertId;
  }

  // Insert all payslips
  for (const slip of payslipData) {
    slip.runId = runId;
    await db.insert(payslips).values(slip);
  }

  return { runId, payslipCount: payslipData.length, totals };
}

export async function getPayslipsForRun(runId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT p.*, e.name AS employeeName, e.role, e.department, e.bankAccount, e.ifscCode
    FROM payslips p
    JOIN employees e ON e.id = p.employeeId
    WHERE p.runId = ${runId}
    ORDER BY e.name
  `);
  return (rows[0] as unknown as any[]);
}

export async function getPayslipForEmployee(employeeId: number, month: number, year: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.execute(sql`
    SELECT p.*, e.name AS employeeName, e.role, e.department, e.phone, e.bankAccount, e.ifscCode
    FROM payslips p
    JOIN employees e ON e.id = p.employeeId
    WHERE p.employeeId = ${employeeId} AND p.month = ${month} AND p.year = ${year}
    LIMIT 1
  `);
  return (rows[0] as unknown as any[])[0] ?? null;
}

export async function markPayrollPaid(runId: number, paymentDate: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(payrollRuns).set({ status: 'paid' }).where(eq(payrollRuns.id, runId));
  await db.update(payslips).set({ paymentStatus: 'paid', paymentDate }).where(eq(payslips.runId, runId));
}
