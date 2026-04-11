# Indhan — BEES Fuel Station OS — TODO

## Database & Backend
- [x] Database schema: users, customers, products, transactions, daily_reports, expenses, bank_transactions, weigh_bridge, inventory, purchase_orders
- [x] tRPC router: dashboard (KPIs, real-time metrics, trends)
- [x] tRPC router: daily reconciliation (cash, card, bank matching)
- [x] tRPC router: customers (receivables, credit limits, aging, payments)
- [x] tRPC router: inventory (stock levels, alerts, purchase orders)
- [x] tRPC router: expenses (CRUD, categories, approval workflow)
- [x] tRPC router: bank transactions (NEFT, RTGS, IMPS, Cash, UPI)
- [x] tRPC router: weigh bridge (vehicle logs, cumulative totals)
- [x] tRPC router: P&L reporting (daily, monthly, period-based)
- [x] tRPC router: Excel import (BEES format migration, 3-year historical data)
- [x] tRPC router: Sathi AI agent (NL queries, report generation, anomaly detection)
- [x] tRPC router: sales (list, create, nozzle readings)
- [ ] tRPC router: employees (onboarding, attendance, payroll — Phase 2)

## Frontend - Global
- [x] Premium dark theme (Indhan amber/gold accents, Inter + Plus Jakarta Sans fonts)
- [x] DashboardLayout with sidebar navigation (all 10 modules)
- [x] Indian currency ₹ formatting throughout
- [x] Fuel margins: Petrol ₹3.95/L, Diesel ₹2.49/L
- [x] Responsive design for all screen sizes
- [x] Role-based access control (admin/user roles in schema)
- [ ] Language switcher: Hindi, Telugu (Phase 2)

## Frontend - Modules
- [x] Executive Dashboard: KPIs, sales chart, fuel margins, cash position
- [x] Daily Reconciliation: automated matching, closing stock, cash balance
- [x] Customer Receivables: credit limits, outstanding balances, aging reports
- [x] Inventory Management: stock levels, low-stock alerts, purchase orders (IOC)
- [x] Daily Expenses: category-wise entry, approval workflow, analytics
- [x] Bank Statement: transaction log, reconciliation status, running balance
- [x] P&L Reporting: daily/monthly/period statements, margin breakdowns
- [x] Excel Import: BEES format bulk upload, 3-year historical data migration, auto field-mapping
- [x] Sathi AI Agent: floating chat, NL reports, user guide, anomaly alerts
- [x] Employee Management: UI scaffolded (full backend Phase 2)
- [ ] Weigh Bridge: deferred to Phase 4 (separate business OS)
- [ ] Settings: user management, role assignment, station configuration (Phase 2)

## Testing
- [x] Vitest: auth.logout test (1 test)
- [x] Vitest: Indhan core routers test (10 tests)
- [x] Total: 11 tests passing

## Data Import
- [ ] Import 3 years of BEES historical data (Excel files ready, import module built)

## Phase 2 Backlog
- [ ] Language switcher: Hindi, Telugu
- [ ] Employee full backend: attendance, payroll, PF/ESI
- [ ] Settings module: user management, role assignment
- [ ] Mobile app (React Native)
- [ ] WhatsApp notifications (optional channel)
- [ ] Voice commands (Sathi voice mode)

## UI Enhancements
- [x] Dark/light mode toggle in header with localStorage persistence
- [x] Light mode CSS variables (clean white/grey palette)
- [x] Dark mode CSS variables (amber/gold premium dark)

## Phase 1 Critical Bug Fixes
- [x] Fix 1: routers.ts broken export causing app crash (esbuild TransformError)
- [x] Fix 2: customer_payments paymentMethod empty string — re-import with correct enum values
- [x] Fix 3: outstandingBalance not computed — update all customers from actual payment data
- [x] Fix 4: getDashboardKPIs receivables queries wrong table — fix to use customer_payments
- [x] Fix 5: Verify app loads cleanly with real data after all fixes

## Phase 2 Date Filter Fixes
- [x] Dashboard: date filter fallback to latest data month (March 2026) when April 2026 has no data
- [x] Expenses: default date range changed to March 2026 (was April 2026 — showed ₹0)
- [x] Bank Statement: default date range changed to March 2026 (was April 2026 — showed ₹0)
- [x] P&L Reports: default date range changed to March 2026 (was April 2026 — showed ₹0)
- [x] Reconciliation: default date changed to March 31, 2026 (was April 12 — showed empty)
- [x] Customers & Inventory: confirmed no date filter issue (load all records, no date range)
- [x] All 11 tests passing after fixes

## Critical Bug Fix — RangeError: Invalid time value (Production Crash)
- [x] Root cause identified: TiDB Cloud returns varchar date columns as full ISO timestamps (e.g. "2026-03-31T04:00:00.000Z") not plain "YYYY-MM-DD" strings
- [x] Fix: Added .slice(0, 10) normalization in db.ts for all date fields returned from DB (getDailyTrend, getExpenses, getBankTransactions, getDailyReports, getDailyReport, getSalesTransactions)
- [x] Fix: Added defensive try/catch + regex validation in Dashboard.tsx chartData useMemo
- [x] Fix: Updated Reports.tsx chartData to use reportDate field with normalization
- [x] All 11 tests still passing after fix

## Performance & Security Audit
- [ ] Security: Verify all tRPC procedures use protectedProcedure (no unguarded endpoints)
- [ ] Security: Validate all user inputs with Zod schemas (type, range, length limits)
- [ ] Security: Check for SQL injection risks in raw sql`` template literals
- [ ] Security: Ensure no sensitive data (DB credentials, JWT secret) exposed to frontend
- [ ] Security: Check rate limiting on auth and mutation endpoints
- [ ] Security: Verify CORS and cookie security settings
- [ ] Security: Check for XSS risks in Sathi AI output rendering
- [ ] Performance: Audit DB query efficiency — N+1 queries, missing indexes
- [ ] Performance: Check bundle size and code splitting
- [ ] Performance: Verify API response times for dashboard KPI queries
- [ ] Performance: Add DB indexes for frequently queried date columns
- [ ] Performance: Check for unnecessary re-renders in React components

## Date Filter Button Audit & Fixes
- [x] Dashboard: Today/7 Days/MTD buttons now filter both KPI data AND chart data to the selected period
- [x] Expenses: Added Mar 2026 / Feb 2026 / Jan 2026 / Q1 2026 / Custom preset buttons — all filter list and chart
- [x] Bank Statement: Added Mar 2026 / Feb 2026 / Jan 2026 / Q1 2026 / Custom preset buttons — all filter transactions
- [x] P&L Reports: Fixed revenue to use date-range query (was always showing last 30 days); added preset buttons; chart now responds to date selection
- [x] Reconciliation: Date picker confirmed working correctly
- [ ] Sales & Nozzles: Page is a placeholder — not yet built
- [ ] WeighBridge: To be verified in next session
- [x] All pages: Filter state is local per page (no cross-page persistence needed)

## Dashboard Date Display Fix
- [x] Dashboard header now shows "Sunday, 31 March 2026" (latest data date) instead of system date
- [x] Added amber badge "Data: Apr 2025 – Mar 2026" to make data currency visible
- [x] Period buttons updated: "31 Mar" / "7 Days" / "MTD" / "FY 25-26" — all reference data period
- [x] KPI sub-labels updated: "31 Mar 2026" / "25–31 Mar 2026" / "Mar 2026" / "Apr 2025 – Mar 2026"
- [x] Chart title is dynamic and matches selected period
- [x] Fallback chart uses data period dates, not system clock

## Dashboard Custom Date Range Picker
- [x] Added "Custom" button alongside Today/7 Days/MTD/FY 25-26
- [x] When "Custom" is active, From/To date inputs appear (min: 2025-04-01, max: 2026-03-31)
- [x] Apply button triggers KPI and chart data refresh for the custom range
- [x] Chart title updates to show the selected custom range dates
- [x] KPI sub-label updates to show the custom range (e.g. "2025-06-01 – 2025-08-31")
