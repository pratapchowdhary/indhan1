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
import { Landmark, Plus, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const txTypeColors: Record<string, string> = {
  "NEFT": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "RTGS": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "IMPS": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "Cash": "text-green-400 bg-green-500/10 border-green-500/20",
  "Credit Card": "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "UPI": "text-pink-400 bg-pink-500/10 border-pink-500/20",
};

// Period presets relative to latest data
const PRESETS = [
  { label: "Mar 2026", start: "2026-03-01", end: "2026-03-31" },
  { label: "Feb 2026", start: "2026-02-01", end: "2026-02-28" },
  { label: "Jan 2026", start: "2026-01-01", end: "2026-01-31" },
  { label: "Q1 2026",  start: "2026-01-01", end: "2026-03-31" },
  { label: "Custom",   start: "",           end: "" },
];

export default function BankStatement() {
  const [addOpen, setAddOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-31");

  const [form, setForm] = useState({
    transactionDate: format(new Date(), "yyyy-MM-dd"),
    description: "",
    transactionType: "NEFT",
    withdrawal: "",
    deposit: "",
    referenceNo: "",
  });

  const { data: transactions, refetch } = trpc.bank.list.useQuery({ startDate, endDate });
  const { data: summary } = trpc.bank.summary.useQuery({ startDate, endDate });

  const createTx = trpc.bank.create.useMutation({
    onSuccess: () => { toast.success("Transaction recorded"); setAddOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reconcile = trpc.bank.reconcile.useMutation({
    onSuccess: () => { toast.success("Marked as reconciled"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function applyPreset(idx: number) {
    setActivePreset(idx);
    if (idx < PRESETS.length - 1) {
      setStartDate(PRESETS[idx].start);
      setEndDate(PRESETS[idx].end);
    }
  }

  const totalDeposits = Number(summary?.totalDeposits ?? 0);
  const totalWithdrawals = Number(summary?.totalWithdrawals ?? 0);
  const netFlow = totalDeposits - totalWithdrawals;
  const pendingCount = transactions?.filter((t: any) => t.reconciliationStatus === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank Statement</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Transaction history and reconciliation</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Transaction</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border/50">
            <DialogHeader><DialogTitle>Record Bank Transaction</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" className="bg-secondary border-border/50" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select defaultValue="NEFT" onValueChange={v => setForm(f => ({ ...f, transactionType: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["NEFT", "RTGS", "IMPS", "Cash", "Credit Card", "UPI"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Description *</Label>
                  <Input placeholder="Transaction description" className="bg-secondary border-border/50" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Deposit (₹)</Label>
                  <Input type="number" placeholder="0.00" className="bg-secondary border-border/50" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Withdrawal (₹)</Label>
                  <Input type="number" placeholder="0.00" className="bg-secondary border-border/50" value={form.withdrawal} onChange={e => setForm(f => ({ ...f, withdrawal: e.target.value }))} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Reference No.</Label>
                  <Input placeholder="Optional" className="bg-secondary border-border/50" value={form.referenceNo} onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))} />
                </div>
              </div>
              <Button className="w-full" onClick={() => {
                if (!form.description) { toast.error("Description is required"); return; }
                createTx.mutate({
                  transactionDate: form.transactionDate,
                  description: form.description,
                  transactionType: form.transactionType as any,
                  deposit: parseFloat(form.deposit || "0"),
                  withdrawal: parseFloat(form.withdrawal || "0"),
                  referenceNo: form.referenceNo || undefined,
                });
              }} disabled={createTx.isPending}>
                {createTx.isPending ? "Saving..." : "Record Transaction"}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-green-500/20 bg-green-500/10 flex items-center justify-center mb-3">
              <ArrowDownLeft className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-xl font-bold tabular-nums text-green-400">{fmt(totalDeposits)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Deposits</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-red-500/20 bg-red-500/10 flex items-center justify-center mb-3">
              <ArrowUpRight className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-xl font-bold tabular-nums text-red-400">{fmt(totalWithdrawals)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Withdrawals</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-primary/20 bg-primary/10 flex items-center justify-center mb-3">
              <Landmark className="w-4 h-4 text-primary" />
            </div>
            <p className={`text-xl font-bold tabular-nums ${netFlow >= 0 ? "text-primary" : "text-red-400"}`}>{fmt(netFlow)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Net Flow</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-5">
            <div className="w-9 h-9 rounded-lg border border-amber-500/20 bg-amber-500/10 flex items-center justify-center mb-3">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-400">{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending Reconciliation</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">Transactions ({transactions?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {transactions && transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.slice(0, 100).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge className={`text-[10px] shrink-0 ${txTypeColors[t.transactionType] ?? "text-muted-foreground bg-secondary"}`}>
                      {t.transactionType}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-[11px] text-muted-foreground">{t.transactionDate}{t.referenceNo ? ` · ${t.referenceNo}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {Number(t.deposit) > 0 && <p className="text-sm font-semibold text-green-400 tabular-nums">+{fmt(Number(t.deposit))}</p>}
                      {Number(t.withdrawal) > 0 && <p className="text-sm font-semibold text-red-400 tabular-nums">-{fmt(Number(t.withdrawal))}</p>}
                    </div>
                    {t.reconciliationStatus === "matched" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs h-7 px-2 shrink-0" onClick={() => reconcile.mutate({ id: t.id, status: "matched" })}>
                        Reconcile
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions found for this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
