/**
 * Indhan Payroll Computation Engine
 * Indian Labour Law Compliance — FY 2025-26
 *
 * Rules implemented:
 * 1. EPF (Employees' Provident Funds Act, 1952)
 *    - Employee: 12% of Basic+DA, capped at ₹15,000 basic (max ₹1,800/month)
 *    - Employer EPF: 3.67% of Basic+DA (same cap)
 *    - Employer EPS: 8.33% of Basic+DA, capped at ₹1,250/month
 *
 * 2. ESI (Employees' State Insurance Act, 1948)
 *    - Employee: 0.75% of gross wages
 *    - Employer: 3.25% of gross wages
 *    - Applicable only if gross ≤ ₹21,000/month
 *
 * 3. Professional Tax — Telangana
 *    - Gross ≤ ₹15,000: Nil
 *    - Gross ₹15,001–₹20,000: ₹150/month
 *    - Gross > ₹20,000: ₹200/month
 */

export interface PayrollInput {
  basicSalary: number;         // Monthly basic salary
  hra: number;                 // House Rent Allowance
  otherAllowances: number;     // Other allowances
  workingDays: number;         // Standard working days in month (default 26)
  daysPresent: number;         // Actual days present (includes 0.5 for half-day)
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
}

export interface PayrollResult {
  // Attendance
  daysPresent: number;
  workingDays: number;
  // Earnings
  basicEarned: number;
  hraEarned: number;
  otherAllowancesEarned: number;
  grossEarned: number;
  // Deductions (employee side)
  pfEmployee: number;
  esiEmployee: number;
  professionalTax: number;
  totalDeductions: number;
  netPay: number;
  // Employer contributions (cost tracking, not deducted from employee)
  pfEmployer: number;       // 3.67% EPF
  epsEmployer: number;      // 8.33% EPS (capped ₹1,250)
  esiEmployer: number;      // 3.25% ESI
  totalEmployerCost: number; // gross + all employer contributions
}

const PF_BASIC_CAP = 15000;         // PF computed on max ₹15,000 basic
const PF_EMPLOYEE_RATE = 0.12;      // 12%
const PF_EMPLOYER_EPF_RATE = 0.0367; // 3.67%
const PF_EMPLOYER_EPS_RATE = 0.0833; // 8.33%
const PF_EPS_CAP = 1250;            // EPS employer capped at ₹1,250/month

const ESI_GROSS_THRESHOLD = 21000;  // ESI applicable if gross ≤ ₹21,000
const ESI_EMPLOYEE_RATE = 0.0075;   // 0.75%
const ESI_EMPLOYER_RATE = 0.0325;   // 3.25%

// Telangana PT slabs
function computePT(grossEarned: number): number {
  if (grossEarned <= 15000) return 0;
  if (grossEarned <= 20000) return 150;
  return 200;
}

export function computePayroll(input: PayrollInput): PayrollResult {
  const { basicSalary, hra, otherAllowances, workingDays, daysPresent,
          pfApplicable, esiApplicable, ptApplicable } = input;

  // Attendance ratio (pro-rate if absent)
  const attendanceRatio = workingDays > 0 ? Math.min(daysPresent / workingDays, 1) : 0;

  // Pro-rated earnings
  const basicEarned = round2(basicSalary * attendanceRatio);
  const hraEarned = round2(hra * attendanceRatio);
  const otherAllowancesEarned = round2(otherAllowances * attendanceRatio);
  const grossEarned = round2(basicEarned + hraEarned + otherAllowancesEarned);

  // ── PF computation ──────────────────────────────────────────────────────────
  let pfEmployee = 0;
  let pfEmployer = 0;
  let epsEmployer = 0;

  if (pfApplicable && basicEarned > 0) {
    const pfBase = Math.min(basicEarned, PF_BASIC_CAP);
    pfEmployee = round2(pfBase * PF_EMPLOYEE_RATE);
    pfEmployer = round2(pfBase * PF_EMPLOYER_EPF_RATE);
    epsEmployer = Math.min(Math.round(pfBase * PF_EMPLOYER_EPS_RATE), PF_EPS_CAP);
  }

  // ── ESI computation ─────────────────────────────────────────────────────────
  let esiEmployee = 0;
  let esiEmployer = 0;

  if (esiApplicable && grossEarned > 0 && grossEarned <= ESI_GROSS_THRESHOLD) {
    esiEmployee = round2(grossEarned * ESI_EMPLOYEE_RATE);
    esiEmployer = round2(grossEarned * ESI_EMPLOYER_RATE);
  }

  // ── Professional Tax ────────────────────────────────────────────────────────
  const professionalTax = ptApplicable ? computePT(grossEarned) : 0;

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalDeductions = round2(pfEmployee + esiEmployee + professionalTax);
  const netPay = round2(grossEarned - totalDeductions);
  const totalEmployerCost = round2(grossEarned + pfEmployer + epsEmployer + esiEmployer);

  return {
    daysPresent,
    workingDays,
    basicEarned,
    hraEarned,
    otherAllowancesEarned,
    grossEarned,
    pfEmployee,
    esiEmployee,
    professionalTax,
    totalDeductions,
    netPay,
    pfEmployer,
    epsEmployer,
    esiEmployer,
    totalEmployerCost,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute next due date from last done date + frequency
 */
export function computeNextDueDate(lastDoneDate: string, frequency: string): string {
  const d = new Date(lastDoneDate + 'T00:00:00');
  switch (frequency) {
    case 'daily':       d.setDate(d.getDate() + 1); break;
    case 'weekly':      d.setDate(d.getDate() + 7); break;
    case 'monthly':     d.setMonth(d.getMonth() + 1); break;
    case 'quarterly':   d.setMonth(d.getMonth() + 3); break;
    case 'half_yearly': d.setMonth(d.getMonth() + 6); break;
    case 'annual':      d.setFullYear(d.getFullYear() + 1); break;
    default:            return ''; // as_needed — no auto next date
  }
  return d.toISOString().slice(0, 10);
}

/** Alias for backward compatibility */
export const computePayslip = computePayroll;
