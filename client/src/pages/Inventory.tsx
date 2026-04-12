import { trpc } from "@/lib/trpc";
import { useState, useCallback, useRef } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, ShoppingCart, AlertTriangle, Droplets, Package, CheckCircle, Clock, Truck, Search, LayoutGrid, List, ScanLine, FlaskConical, TrendingDown, TrendingUp, Minus, Save, Pencil, History } from "lucide-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtL = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n) + " L";

// ─── Dip variance badge ───────────────────────────────────────────────────────
function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) return <span className="text-muted-foreground text-xs italic">—</span>;
  const abs = Math.abs(variance);
  const tol = 10;
  if (abs <= tol) return (
    <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
      <Minus className="w-3 h-3" />±{abs.toFixed(1)} L <span className="text-[10px] text-green-500/70">OK</span>
    </span>
  );
  if (variance > 0) return (
    <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
      <TrendingDown className="w-3 h-3" />−{abs.toFixed(1)} L <span className="text-[10px] text-red-500/70">Loss</span>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-medium">
      <TrendingUp className="w-3 h-3" />+{abs.toFixed(1)} L <span className="text-[10px] text-blue-500/70">Gain</span>
    </span>
  );
}

// ─── Dip entry card for one fuel type ────────────────────────────────────────
function DipEntryCard({
  fuelType,
  label,
  currentStock,
  todayReading,
  onSaved,
}: {
  fuelType: "petrol" | "diesel";
  label: string;
  currentStock: number;
  todayReading: number | null;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(todayReading != null ? String(todayReading) : "");

  const saveDip = trpc.fuelIntelligence.saveDipReading.useMutation({
    onSuccess: () => {
      toast.success(`${label} dip reading saved`);
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = useCallback(() => {
    const litres = parseFloat(value);
    if (isNaN(litres) || litres < 0) { toast.error("Enter a valid dip reading in litres"); return; }
    saveDip.mutate({ readingDate: today, fuelType, dipLitres: litres });
  }, [value, today, fuelType, saveDip]);

  const previewDip = editing && value !== "" ? parseFloat(value) : null;
  const displayDip = previewDip !== null && !isNaN(previewDip) ? previewDip : todayReading;
  const variance = displayDip !== null ? currentStock - displayDip : null;

  const accentBorder = fuelType === "petrol" ? "border-amber-500/30" : "border-blue-500/30";
  const dotColor = fuelType === "petrol" ? "bg-amber-400" : "bg-blue-400";
  const dipColor = fuelType === "petrol" ? "text-amber-400" : "text-blue-400";

  return (
    <Card className={`border ${accentBorder} bg-card`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-sm font-semibold">{label}</span>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">System Stock</p>
            <p className="text-sm font-bold tabular-nums">{fmtL(currentStock)}</p>
          </div>
        </div>

        {/* Dip entry row */}
        <div className="flex items-center gap-2 mb-3">
          {editing ? (
            <>
              <Input
                autoFocus
                type="number"
                step="0.1"
                min="0"
                max="50000"
                placeholder="Enter litres..."
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="h-9 text-sm bg-secondary border-border/50 tabular-nums flex-1"
              />
              <Button size="sm" className="h-9 px-3" onClick={handleSave} disabled={saveDip.isPending}>
                <Save className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setEditing(false)}>✕</Button>
            </>
          ) : (
            <>
              <div className="flex-1">
                {todayReading !== null ? (
                  <p className={`text-sm font-bold tabular-nums ${dipColor}`}>{fmtL(todayReading)}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No dip reading for today</p>
                )}
                <p className="text-[10px] text-muted-foreground">{today}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={() => { setValue(todayReading != null ? String(todayReading) : ""); setEditing(true); }}
              >
                <Pencil className="w-3 h-3" />
                {todayReading !== null ? "Edit" : "Enter Dip"}
              </Button>
            </>
          )}
        </div>

        {/* Variance row */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground">Dip Variance (Stock − Dip)</span>
          <VarianceBadge variance={variance} />
        </div>

        {/* Live preview while editing */}
        {editing && previewDip !== null && !isNaN(previewDip) && variance !== null && (
          <div className="mt-1.5 text-[10px] text-muted-foreground text-right">
            Preview: {fmtL(currentStock)} − {fmtL(previewDip)} = <span className={variance > 10 ? "text-red-400" : variance < -10 ? "text-blue-400" : "text-green-400"}>{variance >= 0 ? "−" : "+"}{fmtL(Math.abs(variance))}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Circular gauge SVG component
function CircleGauge({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(0.22 0.014 240)" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

function StockGaugeCard({ product }: { product: any }) {
  const current = Number(product.currentStock ?? 0);
  const min = Number(product.reorderLevel ?? 0);
  // Use maxStockLevel if set, otherwise derive a sensible max:
  // fuel: 20,000L tank capacity; lubricants/other: 5× reorder level or 200L minimum
  const rawMax = Number(product.maxStockLevel ?? 0);
  const fallbackMax = product.category === 'fuel' ? 20000 : Math.max(200, min * 5, current * 1.5);
  const max = rawMax > 0 ? rawMax : fallbackMax;
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const isCritical = pct < 15;
  const isLow = pct < 35;
  const color = isCritical ? "#ef4444" : isLow ? "#17897e" : "#22c55e";
  const statusText = isCritical ? "Critical" : isLow ? "Low" : "Good";
  const statusBg = isCritical ? "bg-red-500/10 text-red-400 border-red-500/20" : isLow ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-green-500/10 text-green-400 border-green-500/20";

  return (
    <Card className={`bg-card border-border/50 ${isCritical ? "border-red-500/40" : ""}`}>
      <CardContent className="p-4 flex flex-col items-center gap-2">
        <div className="relative w-20 h-20">
          <CircleGauge pct={pct} color={color} size={80} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold tabular-nums leading-none" style={{ color }}>{Math.round(pct)}%</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold leading-tight">{product.name}</p>
          <p className="text-xl font-bold tabular-nums mt-0.5">{current.toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-muted-foreground">{product.unit}</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusBg}`}>{statusText}</span>
        <div className="w-full flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
          <span>Min {min.toLocaleString("en-IN")}</span>
          <span>{fmt(Number(product.sellingPrice))}/{product.unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// List view row component
function StockListRow({ product }: { product: any }) {
  const current = Number(product.currentStock ?? 0);
  const min = Number(product.reorderLevel ?? 0);
  const max = Number(product.maxStockLevel ?? (product.category === 'fuel' ? 20000 : 200));
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const isCritical = current < min;
  const isLow = !isCritical && pct < 35;
  const color = isCritical ? "text-red-400" : isLow ? "text-amber-400" : "text-green-400";
  const statusText = isCritical ? "Critical" : isLow ? "Low" : "Good";
  const statusBg = isCritical ? "bg-red-500/10 text-red-400 border-red-500/20" : isLow ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-green-500/10 text-green-400 border-green-500/20";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 bg-card/50 hover:bg-card transition-colors">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Package className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{product.name}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{product.category}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold tabular-nums ${color}`}>{current.toLocaleString('en-IN')}</p>
        <p className="text-[10px] text-muted-foreground">{product.unit}</p>
      </div>
      <div className="w-20 shrink-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#22c55e' }} />
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{Math.round(pct)}%</p>
      </div>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${statusBg}`}>{statusText}</span>
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-xs font-medium">Min {min.toLocaleString('en-IN')}</p>
        <p className="text-[10px] text-muted-foreground">₹{Number(product.sellingPrice).toLocaleString('en-IN')}/{product.unit}</p>
      </div>
    </div>
  );
}

const PO_STATUS_META: Record<string, { icon: any; color: string; bg: string }> = {
  delivered: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  ordered:   { icon: Truck,       color: "text-blue-400",  bg: "bg-blue-500/10"  },
  pending:   { icon: Clock,       color: "text-teal-400", bg: "bg-teal-500/10" },
};

export default function Inventory() {
  const [addOpen, setAddOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "fuel", unit: "L", currentStock: "", minStockLevel: "", maxStockLevel: "", costPrice: "", sellingPrice: "" });
  const [poForm, setPoForm] = useState({ productId: "", quantityOrdered: "", unitPrice: "", notes: "" });
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [scannerOpen, setScannerOpen] = useState(false);
  const [showDipHistory, setShowDipHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const handleScan = (code: string) => {
    setScannerOpen(false);
    setSearch(code);
    toast.success(`Scanned: ${code}`, { description: "Showing matching products below" });
  };
  const { data: products, refetch } = trpc.inventory.list.useQuery();
  const { data: lowStock } = trpc.inventory.lowStock.useQuery();
  const { data: purchaseOrders } = trpc.inventory.purchaseOrders.useQuery();
  const { data: dipReadings, refetch: refetchDips } = trpc.fuelIntelligence.getDipReadings.useQuery({ limit: 28 });
  const handleRefresh = useCallback(async () => {
    await refetch();
    await refetchDips();
    toast.success("Inventory refreshed", { duration: 2000 });
  }, [refetch, refetchDips]);

  const { pulling, refreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 72,
    containerRef: scrollRef,
  });

  const addProduct = trpc.inventory.addProduct.useMutation({
    onSuccess: () => { toast.success("Product added"); setAddOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createPO = trpc.inventory.createPurchaseOrder.useMutation({
    onSuccess: () => { toast.success("PO created"); setPoOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const q = search.toLowerCase().trim();
  const filteredProducts = products?.filter((p: any) => !q || p.name.toLowerCase().includes(q)) ?? [];
  const fuelProducts = filteredProducts.filter((p: any) => p.category === "fuel");
  const lubricants = filteredProducts.filter((p: any) => p.category === "lubricant");
   const others = filteredProducts.filter((p: any) => p.category === "other");

  // Current stock for fuel products
  const petrolProduct = products?.find((p: any) => p.name === "Petrol (MS)");
  const dieselProduct = products?.find((p: any) => p.name === "Diesel (HSD)");
  const petrolStock = Number(petrolProduct?.currentStock ?? 0);
  const dieselStock = Number(dieselProduct?.currentStock ?? 0);

  // Today's dip readings
  const todayPetrolDip = dipReadings?.find((r: any) => r.reading_date === today && r.fuel_type === "petrol");
  const todayDieselDip = dipReadings?.find((r: any) => r.reading_date === today && r.fuel_type === "diesel");

  // Unique dates for history table
  const historyDates = Array.from(new Set(dipReadings?.map((r: any) => r.reading_date) ?? [])).slice(0, 7) as string[];

  return (
    <div className="space-y-5" ref={scrollRef}>
      {/* Pull-to-refresh indicator */}
      {(pulling || refreshing) && (
        <div
          className="flex items-center justify-center gap-2 overflow-hidden transition-all"
          style={{ height: pullDistance > 0 ? `${pullDistance}px` : refreshing ? "48px" : "0px" }}
        >
          <div
            className={`w-7 h-7 rounded-full border-2 border-primary border-t-transparent flex items-center justify-center ${
              refreshing ? "animate-spin" : ""
            }`}
            style={!refreshing ? { transform: `rotate(${(pullDistance / 72) * 360}deg)` } : {}}
          />
          <span className="text-xs text-primary font-medium">
            {refreshing ? "Refreshing…" : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}
      {/* Barcode Scanner Modal */}
      {scannerOpen && <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search bar */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-secondary border-border/50"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lowStock && lowStock.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-red-400">{lowStock.length} low stock</span>
            </div>
          )}
          <span className="text-xs text-muted-foreground">{filteredProducts.length} products</span>
          {/* Grid / List toggle */}
          <div className="flex items-center rounded-lg border border-border/50 overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setScannerOpen(true)}
            title="Scan barcode or QR code"
          >
            <ScanLine className="w-3.5 h-3.5" /> Scan
          </Button>
          <Dialog open={poOpen} onOpenChange={setPoOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <ShoppingCart className="w-3.5 h-3.5" /> PO
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border/50">
              <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-xs">
                  <p className="font-semibold text-primary">Indian Oil Corporation</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Product</Label>
                  <Select onValueChange={v => setPoForm(f => ({ ...f, productId: v }))}>
                    <SelectTrigger className="bg-secondary border-border/50 h-8 text-sm"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantity</Label>
                    <Input placeholder="5000" className="bg-secondary border-border/50 h-8 text-sm" value={poForm.quantityOrdered} onChange={e => setPoForm(f => ({ ...f, quantityOrdered: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unit Price (₹)</Label>
                    <Input placeholder="95.50" className="bg-secondary border-border/50 h-8 text-sm" value={poForm.unitPrice} onChange={e => setPoForm(f => ({ ...f, unitPrice: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full h-9" onClick={() => {
                  if (!poForm.productId || !poForm.quantityOrdered || !poForm.unitPrice) { toast.error("Fill all fields"); return; }
                  createPO.mutate({
                    productId: parseInt(poForm.productId),
                    quantityOrdered: poForm.quantityOrdered,
                    unitPrice: poForm.unitPrice,
                    totalAmount: String(parseFloat(poForm.quantityOrdered) * parseFloat(poForm.unitPrice)),
                    orderDate: "2026-03-31",
                    supplier: "Indian Oil Corporation",
                    notes: poForm.notes || undefined,
                  });
                }} disabled={createPO.isPending}>
                  {createPO.isPending ? "Creating..." : "Create PO"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8 text-xs"><Plus className="w-3.5 h-3.5" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border/50">
              <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2 sm:col-span-2">
                    <Label className="text-xs">Name</Label>
                    <Input placeholder="e.g. Petrol" className="bg-secondary border-border/50 h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select defaultValue="fuel" onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger className="bg-secondary border-border/50 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fuel">Fuel</SelectItem>
                        <SelectItem value="lubricant">Lubricant</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unit</Label>
                    <Select defaultValue="L" onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                      <SelectTrigger className="bg-secondary border-border/50 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L">Litres</SelectItem>
                        <SelectItem value="Kg">Kg</SelectItem>
                        <SelectItem value="Units">Units</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">Current Stock</Label><Input placeholder="0" className="bg-secondary border-border/50 h-8 text-sm" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Min Level</Label><Input placeholder="0" className="bg-secondary border-border/50 h-8 text-sm" value={form.minStockLevel} onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Cost (₹)</Label><Input placeholder="0" className="bg-secondary border-border/50 h-8 text-sm" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Sell Price (₹)</Label><Input placeholder="0" className="bg-secondary border-border/50 h-8 text-sm" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} /></div>
                </div>
                <Button className="w-full h-9" onClick={() => {
                  if (!form.name) { toast.error("Name required"); return; }
                  addProduct.mutate({ name: form.name, category: form.category as any, unit: form.unit, currentStock: form.currentStock || "0", minStockLevel: form.minStockLevel || "0", maxStockLevel: form.maxStockLevel || "10000", costPrice: form.costPrice || "0", sellingPrice: form.sellingPrice || "0" });
                }} disabled={addProduct.isPending}>
                  {addProduct.isPending ? "Adding..." : "Add Product"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ─── DIP READINGS SECTION ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dip Readings &amp; Variance</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">Today {today}</Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs gap-1.5 text-muted-foreground"
            onClick={() => setShowDipHistory(h => !h)}
          >
            <History className="w-3.5 h-3.5" />
            {showDipHistory ? "Hide History" : "History"}
          </Button>
        </div>

        {/* Entry cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <DipEntryCard
            fuelType="petrol"
            label="Petrol (MS)"
            currentStock={petrolStock}
            todayReading={todayPetrolDip ? Number(todayPetrolDip.dip_litres) : null}
            onSaved={refetchDips}
          />
          <DipEntryCard
            fuelType="diesel"
            label="Diesel (HSD)"
            currentStock={dieselStock}
            todayReading={todayDieselDip ? Number(todayDieselDip.dip_litres) : null}
            onSaved={refetchDips}
          />
        </div>

        {/* Variance explanation */}
        <p className="text-[11px] text-muted-foreground mb-3">
          <span className="font-medium text-foreground/70">Dip Variance</span> = System Stock (from last reconciliation) − Manual Dip Reading.
          {" "}<span className="text-red-400">Positive = stock loss</span> · <span className="text-blue-400">Negative = stock gain</span> · <span className="text-green-400">±10 L = within tolerance</span>
        </p>

        {/* Dip reading history table */}
        {showDipHistory && (
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Recent Dip Reading History
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left px-4 py-2 text-muted-foreground font-medium">Date</th>
                      <th className="text-right px-4 py-2 text-amber-400 font-medium">Petrol Dip</th>
                      <th className="text-right px-4 py-2 text-amber-400/70 font-medium">Petrol Var</th>
                      <th className="text-right px-4 py-2 text-blue-400 font-medium">Diesel Dip</th>
                      <th className="text-right px-4 py-2 text-blue-400/70 font-medium">Diesel Var</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyDates.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-muted-foreground italic">No dip readings recorded yet</td>
                      </tr>
                    )}
                    {historyDates.map((date: string) => {
                      const pRow = dipReadings?.find((r: any) => r.reading_date === date && r.fuel_type === "petrol");
                      const dRow = dipReadings?.find((r: any) => r.reading_date === date && r.fuel_type === "diesel");
                      return (
                        <tr key={date} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium tabular-nums">{date}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-amber-400">
                            {pRow ? fmtL(Number(pRow.dip_litres)) : <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {pRow && date === today
                              ? <VarianceBadge variance={petrolStock - Number(pRow.dip_litres)} />
                              : <span className="text-muted-foreground text-[10px]">{pRow ? "historical" : "—"}</span>
                            }
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-blue-400">
                            {dRow ? fmtL(Number(dRow.dip_litres)) : <span className="text-muted-foreground italic">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {dRow && date === today
                              ? <VarianceBadge variance={dieselStock - Number(dRow.dip_litres)} />
                              : <span className="text-muted-foreground text-[10px]">{dRow ? "historical" : "—"}</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {historyDates.length > 0 && (
                <p className="text-[10px] text-muted-foreground px-4 py-2 border-t border-border/20">
                  Variance shown only for today’s readings (vs. current system stock). Historical variance requires daily stock snapshots.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fuel Products */}
      {fuelProducts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Droplets className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fuel</span>
          </div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {fuelProducts.map((p: any) => <StockGaugeCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {fuelProducts.map((p: any) => <StockListRow key={p.id} product={p} />)}
            </div>
          )}
        </div>
      )}

      {/* Lubricants */}
      {lubricants.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lubricants</span>
          </div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {lubricants.map((p: any) => <StockGaugeCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {lubricants.map((p: any) => <StockListRow key={p.id} product={p} />)}
            </div>
          )}
        </div>
      )}

      {/* Others */}
      {others.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other</span>
          </div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {others.map((p: any) => <StockGaugeCard key={p.id} product={p} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {others.map((p: any) => <StockListRow key={p.id} product={p} />)}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {(!products || products.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Package className="w-12 h-12 opacity-20" />
          <p className="text-sm">No products yet</p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Add first product</Button>
        </div>
      )}

      {/* Purchase Orders */}
      {purchaseOrders && purchaseOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Purchase Orders</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {purchaseOrders.slice(0, 6).map((po: any) => {
              const meta = PO_STATUS_META[po.status] ?? PO_STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <Card key={po.id} className="bg-card border-border/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{po.productName ?? "Product"}</p>
                      <p className="text-[10px] text-muted-foreground">{po.orderDate} · {Number(po.quantityOrdered).toLocaleString('en-IN')} {po.productUnit ?? 'units'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{fmt(Number(po.totalAmount ?? 0))}</p>
                      <span className={`text-[10px] font-medium ${meta.color}`}>{po.status}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
