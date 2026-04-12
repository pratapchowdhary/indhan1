import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, CheckCircle, Clock, XCircle, Calendar,
  Wallet, Users, Zap, Coffee, Wrench, Award, ShoppingCart, MoreHorizontal
} from "lucide-react";
import { format } from "date-fns";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toFixed(0)}`;
};

const CATEGORY_META: Record<string, { icon: any; color: string; bg: string; bar: string }> = {
  "Wages":            { icon: Users,        color: "#60a5fa", bg: "bg-blue-500/10",    bar: "#60a5fa" },
  "Admin":            { icon: Wallet,       color: "#a78bfa", bg: "bg-purple-500/10",  bar: "#a78bfa" },
  "Electricity":      { icon: Zap,          color: "#fbbf24", bg: "bg-yellow-500/10",  bar: "#fbbf24" },
  "Hospitality":      { icon: Coffee,       color: "#f472b6", bg: "bg-pink-500/10",    bar: "#f472b6" },
  "Maintenance":      { icon: Wrench,       color: "#fb923c", bg: "bg-orange-500/10",  bar: "#fb923c" },
  "Performance Bonus":{ icon: Award,        color: "#34d399", bg: "bg-green-500/10",   bar: "#34d399" },
  "Purchase":         { icon: ShoppingCart, color: "#38bdf8", bg: "bg-sky-500/10",     bar: "#38bdf8" },
};

const DEFAULT_META = { icon: MoreHorizontal, color: "#94a3b8", bg: "bg-slate-500/10", bar: "#94a3b8" };

const EXPENSE_CATEGORIES = Object.keys(CATEGORY_META);

const PRESETS = [
  { label: "Mar 2026", start: "2026-03-01", end: "2026-03-31" },
  { label: "Feb 2026", start: "2026-02-01", end: "2026-02-28" },
  { label: "Jan 2026", start: "2026-01-01", end: "2026-01-31" },
  { label: "Q1 2026",  start: "2026-01-01", end: "2026-03-31" },
  { label: "FY 25-26", start: "2025-04-01", end: "2026-03-31" },
  { label: "Custom",   start: "",           end: "" },
];

const STATUS_ICON: Record<string, any> = {
  approved: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  rejected: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  pending:  <Clock className="w-3.5 h-3.5 text-amber-400" />,
};

export default function Expenses() {
  const [addOpen, setAddOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-31");

  const [form, setForm] = useState({
    expenseDate: format(new Date("2026-03-31"), "yyyy-MM-dd"),
    category: "Wages",
    description: "",
    amount: "",
    paymentMethod: "Cash",
    paidTo: "",
  });

  const { data: expenses, refetch } = trpc.expenses.list.useQuery({ startDate, endDate });
  const { data: summary } = trpc.expenses.summary.useQuery({ startDate, endDate });

  const createExpense = trpc.expenses.create.useMutation({
    onSuccess: () => { toast.success("Expense recorded"); setAddOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const approveExpense = trpc.expenses.approve.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function applyPreset(idx: number) {
    setActivePreset(idx);
    if (idx < PRESETS.length - 1) {
      setStartDate(PRESETS[idx].start);
      setEndDate(PRESETS[idx].end);
    }
  }

  const totalExpenses = expenses?.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0) ?? 0;
  const approvedTotal = expenses?.filter((e: any) => e.approvalStatus === "approved").reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0) ?? 0;
  const pendingCount = expenses?.filter((e: any) => e.approvalStatus === "pending").length ?? 0;

  // Build category breakdown from summary
  const categoryData = useMemo(() => {
    if (!summary || summary.length === 0) return [];
    const total = summary.reduce((s: number, c: any) => s + Number(c.total ?? c.totalAmount ?? 0), 0);
    return summary.map((c: any) => {
      const name = c.subHeadAccount ?? c.category ?? "Other";
      const amount = Number(c.total ?? c.totalAmount ?? 0);
      const meta = CATEGORY_META[name] ?? DEFAULT_META;
      return { name, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0, ...meta };
    }).sort((a: any, b: any) => b.amount - a.amount);
  }, [summary]);

  const maxCategoryAmount = categoryData[0]?.amount ?? 1;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.slice(0, -1).map((p, i) => (
            <Button key={p.label} variant={activePreset === i ? "default" : "outline"} size="sm" className="text-xs h-7 px-3" onClick={() => applyPreset(i)}>
              {p.label}
            </Button>
          ))}
          <Button variant={activePreset === PRESETS.length - 1 ? "default" : "outline"} size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => setActivePreset(PRESETS.length - 1)}>
            <Calendar className="w-3 h-3" />
          </Button>
          {activePreset === PRESETS.length - 1 && (
            <>
              <Input type="date" className="bg-secondary border-border/50 h-7 text-xs w-34" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <Input type="date" className="bg-secondary border-border/50 h-7 text-xs w-34" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </>
          )}
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border/50">
            <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" className="bg-secondary border-border/50 h-8 text-sm" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select defaultValue="Wages" onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Description</Label>
                  <Input placeholder="What was this for?" className="bg-secondary border-border/50 h-8 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input placeholder="0" className="bg-secondary border-border/50 h-8 text-sm font-semibold" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Paid To</Label>
                  <Input placeholder="Vendor / Person" className="bg-secondary border-border/50 h-8 text-sm" value={form.paidTo} onChange={e => setForm(f => ({ ...f, paidTo: e.target.value }))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Payment Method</Label>
                  <Select defaultValue="Cash" onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank Transfer</SelectItem>
                      <SelectItem value="Online">Online / UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={() => {
                if (!form.description || !form.amount) { toast.error("Fill required fields"); return; }
                createExpense.mutate({
                  expenseDate: form.expenseDate,
                  headAccount: "Operating Activities",
                  subHeadAccount: form.category as any,
                  description: form.description,
                  amount: parseFloat(form.amount),
                  modeOfPayment: form.paymentMethod as any,
                  paidBy: form.paidTo || undefined,
                });
              }} disabled={createExpense.isPending}>
                {createExpense.isPending ? "Saving..." : "Record"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums leading-tight">{fmtCompact(totalExpenses)}</p>
              <p className="text-[10px] text-muted-foreground">{PRESETS[activePreset]?.label ?? "Period"} · Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums leading-tight">{fmtCompact(approvedTotal)}</p>
              <p className="text-[10px] text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums leading-tight">{pendingCount}</p>
              <p className="text-[10px] text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Donut + Category Cards */}
      {categoryData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Donut Chart */}
          <Card className="bg-card border-border/50">
            <CardContent className="p-5">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={2}
                    dataKey="amount"
                    nameKey="name"
                  >
                    {categoryData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any, name: any, props: any) => [
                      `${fmtCompact(v)} (${props.payload.pct}%)`,
                      name
                    ]}
                    contentStyle={{
                      background: "oklch(0.17 0.014 240)",
                      border: "1px solid oklch(0.26 0.016 240)",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11, color: "oklch(0.65 0.012 240)" }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centre label */}
              <div className="text-center -mt-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold tabular-nums">{fmtCompact(totalExpenses)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Category breakdown bars */}
          <Card className="bg-card border-border/50">
            <CardContent className="p-5 space-y-3">
              {categoryData.map((cat: any) => {
                const Icon = cat.icon;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg ${cat.bg} flex items-center justify-center`}>
                          <Icon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                        </div>
                        <span className="text-xs font-medium">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tabular-nums">{fmtCompact(cat.amount)}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{cat.pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(cat.amount / maxCategoryAmount) * 100}%`, background: cat.bar }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Expense list */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{expenses?.length ?? 0} records</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {expenses && expenses.length > 0 ? (
            <div className="space-y-1">
              {expenses.slice(0, 60).map((e: any) => {
                const meta = CATEGORY_META[e.subHeadAccount] ?? DEFAULT_META;
                const Icon = meta.icon;
                return (
                  <div key={e.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-secondary/40 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.description}</p>
                      <p className="text-[10px] text-muted-foreground">{e.expenseDate}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold tabular-nums" style={{ color: meta.color }}>
                        -{fmtCompact(Number(e.amount))}
                      </span>
                      {e.approvalStatus === "pending" ? (
                        <button
                          className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center hover:bg-amber-500/20 transition-colors"
                          onClick={() => approveExpense.mutate({ id: e.id, status: "approved", approvedBy: "Kranthi" })}
                          title="Approve"
                        >
                          <Clock className="w-3 h-3 text-amber-400" />
                        </button>
                      ) : (
                        STATUS_ICON[e.approvalStatus] ?? null
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Wallet className="w-10 h-10 opacity-20" />
              <p className="text-sm">No expenses</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
