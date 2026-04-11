import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Receipt, Plus, CheckCircle, Clock, XCircle, BarChart3, Calendar } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const EXPENSE_CATEGORIES = ["Wages", "Admin", "Electricity", "Hospitality", "Maintenance", "Performance Bonus"];

const categoryColors: Record<string, string> = {
  "Wages": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "Admin": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "Electricity": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "Hospitality": "text-pink-400 bg-pink-500/10 border-pink-500/20",
  "Maintenance": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "Performance Bonus": "text-green-400 bg-green-500/10 border-green-500/20",
};

// Period presets relative to latest data
const PRESETS = [
  { label: "Mar 2026", start: "2026-03-01", end: "2026-03-31" },
  { label: "Feb 2026", start: "2026-02-01", end: "2026-02-28" },
  { label: "Jan 2026", start: "2026-01-01", end: "2026-01-31" },
  { label: "Q1 2026",  start: "2026-01-01", end: "2026-03-31" },
  { label: "Custom",   start: "",           end: "" },
];

export default function Expenses() {
  const [addOpen, setAddOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-31");

  const [form, setForm] = useState({
    expenseDate: format(new Date(), "yyyy-MM-dd"),
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
  const pendingCount = expenses?.filter((e: any) => e.approvalStatus === "pending").length ?? 0;

  const chartData = summary?.map((s: any) => ({
    category: (s.subHeadAccount ?? s.category ?? "").split(" ")[0],
    amount: Number(s.total ?? s.totalAmount ?? 0),
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expenses</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Category-wise expense tracking with approval workflow</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border/50">
            <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" className="bg-secondary border-border/50" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select defaultValue="Wages" onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Description *</Label>
                  <Input placeholder="What was this expense for?" className="bg-secondary border-border/50" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input placeholder="0.00" className="bg-secondary border-border/50 text-lg font-semibold" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Paid To</Label>
                  <Input placeholder="Vendor / Person" className="bg-secondary border-border/50" value={form.paidTo} onChange={e => setForm(f => ({ ...f, paidTo: e.target.value }))} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Payment Method</Label>
                  <Select defaultValue="Cash" onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50"><SelectValue /></SelectTrigger>
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
                {createExpense.isPending ? "Recording..." : "Record Expense"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Period Filter Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.slice(0, -1).map((p, i) => (
          <Button key={p.label} variant={activePreset === i ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => applyPreset(i)}>
            {p.label}
          </Button>
        ))}
        <Button variant={activePreset === PRESETS.length - 1 ? "default" : "outline"} size="sm" className="text-xs h-8 gap-1" onClick={() => setActivePreset(PRESETS.length - 1)}>
          <Calendar className="w-3 h-3" /> Custom
        </Button>
        {activePreset === PRESETS.length - 1 && (
          <>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" className="bg-secondary border-border/50 h-8 text-xs w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" className="bg-secondary border-border/50 h-8 text-xs w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-primary/20 bg-primary/10 flex items-center justify-center mb-3">
              <Receipt className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{fmt(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total — {PRESETS[activePreset]?.label ?? "Selected Period"}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-center justify-center mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending Approval</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-green-500/20 bg-green-500/10 flex items-center justify-center mb-3">
              <BarChart3 className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold tabular-nums">{summary?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active Categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold">Expense by Category</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.26 0.016 240)" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: "oklch(0.60 0.012 240)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.60 0.012 240)" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "oklch(0.17 0.014 240)", border: "1px solid oklch(0.26 0.016 240)", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="amount" fill="oklch(0.78 0.15 65)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Expense List */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">Expense Records ({expenses?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {expenses && expenses.length > 0 ? (
            <div className="space-y-2">
              {expenses.slice(0, 50).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-[10px] shrink-0 ${categoryColors[e.subHeadAccount] ?? "text-muted-foreground bg-secondary"}`}>
                      {e.subHeadAccount ?? e.category}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{e.description}</p>
                      <p className="text-[11px] text-muted-foreground">{e.expenseDate} · {e.modeOfPayment ?? e.paymentMethod}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-red-400">-{fmt(Number(e.amount))}</span>
                    {e.approvalStatus === "approved" ? (
                      <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    ) : e.approvalStatus === "rejected" ? (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => approveExpense.mutate({ id: e.id, status: "approved", approvedBy: "Kranthi" })}>
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No expenses found for this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
