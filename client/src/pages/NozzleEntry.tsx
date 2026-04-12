/**
 * NozzleEntry.tsx — Staff Nozzle Sales & Cash Collection Entry
 * Mobile-optimised step-by-step workflow:
 *   Step 1: Select staff + shift
 *   Step 2: Enter opening meter readings for all 4 nozzles
 *   Step 3: Log cash/card/online/credit collections throughout the day
 *   Step 4: Enter closing meter readings
 *   Step 5: Review summary & close shift → auto-populates daily_reports
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Fuel, IndianRupee, CheckCircle2, AlertCircle, Clock,
  ChevronRight, ChevronLeft, Plus, Trash2, ArrowRight,
  Gauge, Wallet, BarChart3, ClipboardCheck, User,
} from "lucide-react";
import { format } from "date-fns";
import { fmtCompact, fmtFull } from "@/lib/format";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = format(new Date(), "yyyy-MM-dd");
const PETROL_PRICE = 103.41;
const DIESEL_PRICE = 89.14;

const fuelColor = (type: string) =>
  type === "petrol"
    ? { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", badge: "bg-amber-500/20 text-amber-300" }
    : { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", badge: "bg-blue-500/20 text-blue-300" };

const modeColor = (mode: string) => {
  if (mode === "cash")   return "text-green-400 bg-green-500/10 border-green-500/20";
  if (mode === "card")   return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (mode === "online") return "text-purple-400 bg-purple-500/10 border-purple-500/20";
  return "text-orange-400 bg-orange-500/10 border-orange-500/20";
};

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { label: "Staff & Shift", icon: User },
  { label: "Opening Readings", icon: Gauge },
  { label: "Collections", icon: Wallet },
  { label: "Closing Readings", icon: Gauge },
  { label: "Summary & Close", icon: ClipboardCheck },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all
              ${active ? "bg-primary text-primary-foreground" : done ? "bg-green-500/20 text-green-400" : "bg-muted/40 text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NozzleEntry() {
  const [step, setStep] = useState(0);
  const [shiftDate, setShiftDate] = useState(TODAY);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [shiftLabel, setShiftLabel] = useState<"morning" | "evening" | "full_day">("full_day");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [openingReadings, setOpeningReadings] = useState<Record<number, string>>({});
  const [closingReadings, setClosingReadings] = useState<Record<number, string>>({});

  // Collection form state
  const [collAmount, setCollAmount] = useState("");
  const [collMode, setCollMode] = useState<"cash" | "card" | "online" | "credit">("cash");
  const [collNozzle, setCollNozzle] = useState<string>("all");
  const [collCustomer, setCollCustomer] = useState("");
  const [collNotes, setCollNotes] = useState("");

  // Data queries
  const { data: staffList } = trpc.nozzle.getStaffList.useQuery();
  const { data: nozzles } = trpc.nozzle.getNozzles.useQuery();
  const { data: collections, refetch: refetchCollections } = trpc.nozzle.getCollections.useQuery(
    { sessionId: sessionId! },
    { enabled: sessionId !== null }
  );
  const { data: summary, refetch: refetchSummary } = trpc.nozzle.getSessionSummary.useQuery(
    { sessionId: sessionId! },
    { enabled: sessionId !== null && step === 4 }
  );

  const utils = trpc.useUtils();

  // Mutations
  const startShift = trpc.nozzle.startShift.useMutation({
    onSuccess: (session) => {
      setSessionId(session.id);
      setStep(1);
      toast.success("Shift started successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveReading = trpc.nozzle.saveReading.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const addCollection = trpc.nozzle.addCollection.useMutation({
    onSuccess: () => {
      refetchCollections();
      setCollAmount("");
      setCollNotes("");
      setCollCustomer("");
      toast.success("Collection recorded");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCollection = trpc.nozzle.deleteCollection.useMutation({
    onSuccess: () => refetchCollections(),
    onError: (e) => toast.error(e.message),
  });

  const closeShift = trpc.nozzle.closeShift.useMutation({
    onSuccess: () => {
      toast.success("Shift closed — daily report updated automatically");
      utils.nozzle.getSessionsForDate.invalidate({ shiftDate });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Step handlers ────────────────────────────────────────────────────────
  const handleStartShift = () => {
    if (!selectedEmployee) return toast.error("Please select a staff member");
    const staff = staffList?.find(s => s.id === selectedEmployee);
    startShift.mutate({
      shiftDate,
      employeeId: selectedEmployee,
      staffName: staff?.name ?? "Staff",
      shiftLabel,
    });
  };

  const handleSaveOpeningReadings = async () => {
    if (!sessionId || !nozzles) return;
    let allSaved = true;
    for (const nozzle of nozzles) {
      const val = openingReadings[nozzle.id];
      if (!val || isNaN(Number(val))) {
        toast.error(`Enter opening reading for ${nozzle.label}`);
        allSaved = false;
        break;
      }
      await saveReading.mutateAsync({
        sessionId,
        nozzleId: nozzle.id,
        readingType: "opening",
        meterReading: Number(val),
      });
    }
    if (allSaved) {
      toast.success("Opening readings saved");
      setStep(2);
    }
  };

  const handleAddCollection = () => {
    if (!sessionId) return;
    if (!collAmount || isNaN(Number(collAmount)) || Number(collAmount) <= 0) {
      return toast.error("Enter a valid amount");
    }
    addCollection.mutate({
      sessionId,
      nozzleId: collNozzle !== "all" ? Number(collNozzle) : undefined,
      amount: Number(collAmount),
      paymentMode: collMode,
      customerName: collCustomer || undefined,
      notes: collNotes || undefined,
    });
  };

  const handleSaveClosingReadings = async () => {
    if (!sessionId || !nozzles) return;
    let allSaved = true;
    for (const nozzle of nozzles) {
      const val = closingReadings[nozzle.id];
      const opening = Number(openingReadings[nozzle.id] ?? 0);
      if (!val || isNaN(Number(val))) {
        toast.error(`Enter closing reading for ${nozzle.label}`);
        allSaved = false;
        break;
      }
      if (Number(val) < opening) {
        toast.error(`Closing reading for ${nozzle.label} cannot be less than opening`);
        allSaved = false;
        break;
      }
      await saveReading.mutateAsync({
        sessionId,
        nozzleId: nozzle.id,
        readingType: "closing",
        meterReading: Number(val),
      });
    }
    if (allSaved) {
      toast.success("Closing readings saved");
      setStep(4);
    }
  };

  const handleCloseShift = () => {
    if (!sessionId) return;
    closeShift.mutate({ sessionId });
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const collectionTotals = useMemo(() => {
    if (!collections) return { cash: 0, card: 0, online: 0, credit: 0, total: 0 };
    return collections.reduce((acc: any, c: any) => {
      acc[c.paymentMode] = (acc[c.paymentMode] ?? 0) + Number(c.amount);
      acc.total += Number(c.amount);
      return acc;
    }, { cash: 0, card: 0, online: 0, credit: 0, total: 0 });
  }, [collections]);

  const liveVolumes = useMemo(() => {
    if (!nozzles) return { petrol: 0, diesel: 0 };
    let petrol = 0, diesel = 0;
    for (const n of nozzles) {
      const o = Number(openingReadings[n.id] ?? 0);
      const c = Number(closingReadings[n.id] ?? 0);
      const dispensed = Math.max(0, c - o);
      if (n.fuelType === "petrol") petrol += dispensed;
      else diesel += dispensed;
    }
    return { petrol, diesel };
  }, [nozzles, openingReadings, closingReadings]);

  const expectedValue = liveVolumes.petrol * PETROL_PRICE + liveVolumes.diesel * DIESEL_PRICE;
  const variance = collectionTotals.total - expectedValue;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Fuel className="w-5 h-5 text-primary" /> Nozzle Entry
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log meter readings & collections — {format(new Date(shiftDate + "T00:00:00"), "dd MMM yyyy")}
          </p>
        </div>
        {sessionId && (
          <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10 text-xs">
            Session #{sessionId} Active
          </Badge>
        )}
      </div>

      <StepBar current={step} />

      {/* ── Step 0: Staff & Shift ─────────────────────────────────────────── */}
      {step === 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Select Staff & Shift
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Shift Date</Label>
              <Input
                type="date"
                value={shiftDate}
                onChange={e => setShiftDate(e.target.value)}
                className="bg-secondary border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Staff Member</Label>
              <Select
                value={selectedEmployee ? String(selectedEmployee) : ""}
                onValueChange={v => setSelectedEmployee(Number(v))}
              >
                <SelectTrigger className="bg-secondary border-border/50">
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList?.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} <span className="text-muted-foreground ml-1 text-xs">({s.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Shift</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["morning", "full_day", "evening"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setShiftLabel(s)}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all
                      ${shiftLabel === s ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border/50 text-muted-foreground hover:border-primary/50"}`}
                  >
                    {s === "morning" ? "☀️ Morning" : s === "evening" ? "🌙 Evening" : "🔄 Full Day"}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full mt-2"
              onClick={handleStartShift}
              disabled={startShift.isPending || !selectedEmployee}
            >
              {startShift.isPending ? "Starting..." : "Start Shift"} <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Opening Readings ──────────────────────────────────────── */}
      {step === 1 && nozzles && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" /> Opening Meter Readings
            </CardTitle>
            <p className="text-xs text-muted-foreground">Record the meter display on each nozzle at shift start</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {nozzles.map(nozzle => {
              const c = fuelColor(nozzle.fuelType);
              return (
                <div key={nozzle.id} className={`p-4 rounded-xl border ${c.bg} ${c.border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Fuel className={`w-4 h-4 ${c.text}`} />
                      <span className="text-sm font-semibold">{nozzle.label}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                      {nozzle.fuelType.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Meter Reading (Litres)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 125430.50"
                      value={openingReadings[nozzle.id] ?? ""}
                      onChange={e => setOpeningReadings(prev => ({ ...prev, [nozzle.id]: e.target.value }))}
                      className="bg-background/50 border-border/50 tabular-nums text-lg font-semibold"
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveOpeningReadings}
                disabled={saveReading.isPending}
              >
                {saveReading.isPending ? "Saving..." : "Save & Continue"} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Collections ───────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Live totals bar */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Cash", value: collectionTotals.cash, color: "text-green-400 bg-green-500/10 border-green-500/20" },
              { label: "Card", value: collectionTotals.card, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
              { label: "Online", value: collectionTotals.online, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
              { label: "Credit", value: collectionTotals.credit, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-xl border text-center ${item.color}`}>
                <p className="text-[10px] font-medium mb-0.5">{item.label}</p>
                <p className="text-sm font-bold tabular-nums">{fmtCompact(item.value)}</p>
                <p className="text-[9px] text-muted-foreground/60 tabular-nums">{fmtFull(item.value)}</p>
              </div>
            ))}
          </div>

          {/* Add collection form */}
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Add Collection Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={collAmount}
                    onChange={e => setCollAmount(e.target.value)}
                    className="bg-secondary border-border/50 tabular-nums text-lg font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Mode</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {(["cash", "card", "online", "credit"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setCollMode(m)}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all capitalize
                          ${collMode === m ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border/50 text-muted-foreground"}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nozzle (optional)</Label>
                <Select value={collNozzle} onValueChange={setCollNozzle}>
                  <SelectTrigger className="bg-secondary border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Nozzles / General</SelectItem>
                    {nozzles?.map(n => (
                      <SelectItem key={n.id} value={String(n.id)}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {collMode === "credit" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer Name</Label>
                  <Input
                    placeholder="Customer name..."
                    value={collCustomer}
                    onChange={e => setCollCustomer(e.target.value)}
                    className="bg-secondary border-border/50"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  placeholder="Any notes..."
                  value={collNotes}
                  onChange={e => setCollNotes(e.target.value)}
                  className="bg-secondary border-border/50"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleAddCollection}
                disabled={addCollection.isPending}
              >
                <Plus className="w-4 h-4 mr-1" />
                {addCollection.isPending ? "Adding..." : "Add Collection"}
              </Button>
            </CardContent>
          </Card>

          {/* Collection log */}
          {collections && collections.length > 0 && (
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Collection Log ({collections.length})</span>
                  <span className="text-primary font-bold tabular-nums">{fmtCompact(collectionTotals.total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2 max-h-64 overflow-y-auto">
                {collections.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${modeColor(c.paymentMode)}`}>
                        {c.paymentMode}
                      </span>
                      <div>
                        <p className="text-sm font-semibold tabular-nums">
                          ₹{Number(c.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </p>
                        {c.customerName && <p className="text-[10px] text-muted-foreground">{c.customerName}</p>}
                        {c.notes && <p className="text-[10px] text-muted-foreground/60">{c.notes}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteCollection.mutate({ id: c.id })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button className="flex-1" onClick={() => setStep(3)}>
              Enter Closing Readings <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Closing Readings ──────────────────────────────────────── */}
      {step === 3 && nozzles && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" /> Closing Meter Readings
            </CardTitle>
            <p className="text-xs text-muted-foreground">Record the meter display on each nozzle at shift end</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {nozzles.map(nozzle => {
              const c = fuelColor(nozzle.fuelType);
              const opening = Number(openingReadings[nozzle.id] ?? 0);
              const closing = Number(closingReadings[nozzle.id] ?? 0);
              const dispensed = closing > opening ? closing - opening : 0;
              return (
                <div key={nozzle.id} className={`p-4 rounded-xl border ${c.bg} ${c.border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Fuel className={`w-4 h-4 ${c.text}`} />
                      <span className="text-sm font-semibold">{nozzle.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Opening: {opening.toLocaleString("en-IN")} L</p>
                      {dispensed > 0 && (
                        <p className={`text-xs font-bold tabular-nums ${c.text}`}>
                          Dispensed: {dispensed.toFixed(2)} L
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Closing Meter Reading (Litres)</Label>
                    <Input
                      type="number"
                      placeholder={`Min: ${opening}`}
                      value={closingReadings[nozzle.id] ?? ""}
                      onChange={e => setClosingReadings(prev => ({ ...prev, [nozzle.id]: e.target.value }))}
                      className="bg-background/50 border-border/50 tabular-nums text-lg font-semibold"
                    />
                  </div>
                </div>
              );
            })}

            {/* Live variance preview */}
            {(liveVolumes.petrol > 0 || liveVolumes.diesel > 0) && (
              <div className={`p-4 rounded-xl border ${Math.abs(variance) < 500 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Live Preview</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Petrol Dispensed</p>
                    <p className="font-bold text-amber-400 tabular-nums">{liveVolumes.petrol.toFixed(2)} L</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Diesel Dispensed</p>
                    <p className="font-bold text-blue-400 tabular-nums">{liveVolumes.diesel.toFixed(2)} L</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Expected Value</p>
                    <p className="font-bold tabular-nums">{fmtCompact(expectedValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Collected</p>
                    <p className="font-bold tabular-nums">{fmtCompact(collectionTotals.total)}</p>
                  </div>
                </div>
                <div className={`mt-2 pt-2 border-t ${Math.abs(variance) < 500 ? "border-green-500/20" : "border-red-500/20"} flex items-center justify-between`}>
                  <span className="text-xs font-medium">Variance</span>
                  <span className={`text-sm font-bold tabular-nums ${Math.abs(variance) < 500 ? "text-green-400" : "text-red-400"}`}>
                    {variance >= 0 ? "+" : ""}{fmtCompact(variance)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveClosingReadings}
                disabled={saveReading.isPending}
              >
                {saveReading.isPending ? "Saving..." : "Save & Review"} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Summary & Close ───────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Shift Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {/* Nozzle volumes */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fuel Dispensed</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <Fuel className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Petrol</p>
                    <p className="text-xl font-bold text-amber-400 tabular-nums">{liveVolumes.petrol.toFixed(2)} L</p>
                    <p className="text-[10px] text-muted-foreground/60 tabular-nums">{fmtFull(liveVolumes.petrol * PETROL_PRICE)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <Fuel className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Diesel</p>
                    <p className="text-xl font-bold text-blue-400 tabular-nums">{liveVolumes.diesel.toFixed(2)} L</p>
                    <p className="text-[10px] text-muted-foreground/60 tabular-nums">{fmtFull(liveVolumes.diesel * DIESEL_PRICE)}</p>
                  </div>
                </div>
              </div>

              {/* Collections */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Collections</p>
                <div className="space-y-2">
                  {[
                    { label: "Cash", value: collectionTotals.cash, color: "text-green-400" },
                    { label: "Card / POS", value: collectionTotals.card, color: "text-blue-400" },
                    { label: "Online / UPI", value: collectionTotals.online, color: "text-purple-400" },
                    { label: "Credit Sales", value: collectionTotals.credit, color: "text-orange-400" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <div className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${item.color}`}>{fmtCompact(item.value)}</span>
                        <p className="text-[10px] text-muted-foreground/50 tabular-nums">{fmtFull(item.value)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-bold">Total Collected</span>
                    <div className="text-right">
                      <span className="text-base font-bold text-primary tabular-nums">{fmtCompact(collectionTotals.total)}</span>
                      <p className="text-[10px] text-muted-foreground/50 tabular-nums">{fmtFull(collectionTotals.total)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Variance */}
              <div className={`p-4 rounded-xl border ${Math.abs(variance) < 500 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {Math.abs(variance) < 500
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <AlertCircle className="w-4 h-4 text-red-400" />}
                  <span className={`text-sm font-semibold ${Math.abs(variance) < 500 ? "text-green-400" : "text-red-400"}`}>
                    {Math.abs(variance) < 500 ? "Balanced" : "Discrepancy Detected"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Expected</p>
                    <p className="font-bold tabular-nums">{fmtCompact(expectedValue)}</p>
                    <p className="text-[9px] text-muted-foreground/50 tabular-nums">{fmtFull(expectedValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Collected</p>
                    <p className="font-bold tabular-nums">{fmtCompact(collectionTotals.total)}</p>
                    <p className="text-[9px] text-muted-foreground/50 tabular-nums">{fmtFull(collectionTotals.total)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Variance</p>
                    <p className={`font-bold tabular-nums ${Math.abs(variance) < 500 ? "text-green-400" : "text-red-400"}`}>
                      {variance >= 0 ? "+" : ""}{fmtCompact(variance)}
                    </p>
                    <p className="text-[9px] text-muted-foreground/50 tabular-nums">
                      {variance >= 0 ? "+" : ""}{fmtFull(Math.abs(variance))}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
                Closing the shift will automatically update today's daily report with petrol/diesel volumes and collection figures. The Reconciliation page will be pre-filled with this data.
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleCloseShift}
                  disabled={closeShift.isPending || closeShift.isSuccess}
                >
                  {closeShift.isPending ? "Closing..." : closeShift.isSuccess ? "✓ Shift Closed" : "Close Shift & Submit"}
                </Button>
              </div>

              {closeShift.isSuccess && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-green-400">Shift Closed Successfully</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Daily report updated. Incharge can now complete reconciliation.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setStep(0);
                      setSessionId(null);
                      setOpeningReadings({});
                      setClosingReadings({});
                      setCollAmount("");
                    }}
                  >
                    Start New Shift
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
