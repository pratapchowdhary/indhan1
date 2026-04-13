/**
 * DailyStockStatement.tsx — Daily Stock Register (READ-ONLY VIEW)
 * Closing stock flows from Nozzle Entry. Dip readings are read-only here.
 * No manual entry or editing is possible on this page.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Droplets, TrendingDown, TrendingUp, AlertTriangle,
  CheckCircle, Info, FlaskConical,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const fmtL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const fmtLShort = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Dip Variance = Closing Stock − Dip Reading
 *  Positive = system closing > dip (possible loss/evaporation)
 *  Negative = dip > system closing (possible gain/meter error) */
function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) return <span className="text-muted-foreground text-xs italic">No dip</span>;
  const abs = Math.abs(variance);
  if (abs < 10) return <span className="text-green-500 text-xs font-semibold">±{fmtLShort(abs)} L ✓</span>;
  if (variance > 0) return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
      <TrendingDown className="w-3 h-3" />−{fmtLShort(abs)} L loss
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-blue-400 text-xs font-semibold">
      <TrendingUp className="w-3 h-3" />+{fmtLShort(abs)} L gain
    </span>
  );
}

/** Read-only Dip Reading display cell */
function DipReadingCell({
  currentDip,
  currentDipStick,
}: {
  currentDip: number | null;
  currentDipStick: number | null;
}) {
  if (currentDip == null) {
    return <span className="text-muted-foreground italic text-[10px]">—</span>;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums text-amber-400 font-medium">{fmtL(currentDip)} L</span>
      {currentDipStick != null && (
        <span className="text-[9px] text-muted-foreground tabular-nums">↑{currentDipStick}</span>
      )}
    </div>
  );
}

export default function DailyStockStatement() {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<"7" | "14" | "30">("14");
  const [fromDate, setFromDate] = useState("2026-03-01");
  const [toDate, setToDate] = useState("2026-03-31");
  const [applied, setApplied] = useState({ fromDate: undefined as string | undefined, toDate: undefined as string | undefined, days: 14 });

  const { data: rows, isLoading } = trpc.inventory.dailyStockStatement.useQuery(applied);

  const summary = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const totalPetrolSales = rows.reduce((s, r) => s + r.petrol.meterSales, 0);
    const totalDieselSales = rows.reduce((s, r) => s + r.diesel.meterSales, 0);
    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const firstRow = sortedRows[0];
    const lastRow = sortedRows[sortedRows.length - 1];
    const totalPetrolReceipts = Math.max(0,
      lastRow.petrol.reportedClosing - firstRow.petrol.openingStock + totalPetrolSales
    );
    const totalDieselReceipts = Math.max(0,
      lastRow.diesel.reportedClosing - firstRow.diesel.openingStock + totalDieselSales
    );
    const dipsEntered = rows.filter(r => r.petrol.dipReading !== null || r.diesel.dipReading !== null).length;
    return { totalPetrolSales, totalDieselSales, totalPetrolReceipts, totalDieselReceipts, dipsEntered };
  }, [rows]);

  function applyPreset(p: "7" | "14" | "30") {
    setPreset(p);
    setMode("preset");
    setApplied({ fromDate: undefined, toDate: undefined, days: parseInt(p) });
  }

  function applyCustom() {
    setMode("custom");
    setApplied({ fromDate, toDate, days: 30 });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
        <div>
          <h2 className="text-base font-bold">Daily Stock Register</h2>
          <p className="text-xs text-muted-foreground">
            Opening + Receipts − Sales = Closing · Dip readings are recorded via Nozzle Entry
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7", "14", "30"] as const).map(d => (
            <Button
              key={d}
              size="sm"
              variant={mode === "preset" && preset === d ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => applyPreset(d)}
            >
              {d === "7" ? "Last 7 Days" : d === "14" ? "Last 14 Days" : "Last 30 Days"}
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-7 text-xs w-32 bg-secondary border-border/50"
              min="2025-04-01" max="2026-03-31"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-7 text-xs w-32 bg-secondary border-border/50"
              min="2025-04-01" max="2026-03-31"
            />
            <Button size="sm" variant={mode === "custom" ? "default" : "outline"} className="h-7 text-xs px-3" onClick={applyCustom}>
              Apply
            </Button>
          </div>
        </div>
      </div>

      {/* SOP Info banner */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-foreground">SOP Formula: </span>
          Closing = Opening − Meter Sales + Receipts.
          {" "}<span className="font-semibold text-amber-400">Dip Variance</span> = Closing Stock − Manual Dip Reading.
          {" "}A <span className="text-red-400 font-semibold">positive variance</span> means system closing &gt; dip (possible loss/evaporation); a <span className="text-blue-400 font-semibold">negative variance</span> means dip &gt; system closing (possible meter error).
          {" "}Dip readings are entered via <span className="font-semibold text-foreground">Nozzle Entry</span>.
        </div>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="bg-card border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Droplets className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Petrol Sales</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtLShort(summary.totalPetrolSales)} L</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Droplets className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Diesel Sales</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtLShort(summary.totalDieselSales)} L</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Implied Receipts (Petrol)</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtLShort(summary.totalPetrolReceipts)} L</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Implied Receipts (Diesel)</span>
              </div>
              <p className="text-lg font-bold tabular-nums">{fmtLShort(summary.totalDieselReceipts)} L</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-amber-500/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Dip Readings</span>
              </div>
              <p className="text-lg font-bold tabular-nums text-amber-400">{summary.dipsEntered} <span className="text-xs text-muted-foreground font-normal">/ {rows?.length ?? 0} days</span></p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            Daily Stock Register
            {rows && <Badge variant="outline" className="text-[10px] ml-auto">{rows.length} days</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : !rows || rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No data for selected period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium w-24">Date</th>
                    <th className="text-right px-3 py-2 text-teal-400 font-semibold" colSpan={6}>
                      <div className="flex items-center justify-end gap-1">
                        <Droplets className="w-3 h-3" />Petrol (MS)
                      </div>
                    </th>
                    <th className="text-right px-3 py-2 text-blue-400 font-semibold" colSpan={6}>
                      <div className="flex items-center justify-end gap-1">
                        <Droplets className="w-3 h-3" />Diesel (HSD)
                      </div>
                    </th>
                  </tr>
                  <tr className="border-b border-border/30 bg-muted/20">
                    <th className="text-left px-4 py-1.5 text-muted-foreground font-medium"></th>
                    {/* Petrol sub-headers */}
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Opening</th>
                    <th className="text-right px-3 py-1.5 text-red-400 font-medium">− Sales</th>
                    <th className="text-right px-3 py-1.5 text-green-400 font-medium">+ Receipts</th>
                    <th className="text-right px-3 py-1.5 text-foreground font-semibold">= Closing</th>
                    <th className="text-right px-3 py-1.5 text-amber-400 font-medium">Dip Reading</th>
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Dip Var.</th>
                    {/* Diesel sub-headers */}
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Opening</th>
                    <th className="text-right px-3 py-1.5 text-red-400 font-medium">− Sales</th>
                    <th className="text-right px-3 py-1.5 text-green-400 font-medium">+ Receipts</th>
                    <th className="text-right px-3 py-1.5 text-foreground font-semibold">= Closing</th>
                    <th className="text-right px-3 py-1.5 text-amber-400 font-medium">Dip Reading</th>
                    <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Dip Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isLatest = i === 0;
                    return (
                      <tr key={row.date} className={`border-b border-border/20 hover:bg-muted/10 transition-colors ${isLatest ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-2 font-medium">
                          <div className="flex items-center gap-1.5">
                            {isLatest && <CheckCircle className="w-3 h-3 text-primary shrink-0" />}
                            <span>{row.date}</span>
                          </div>
                        </td>
                        {/* Petrol */}
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtL(row.petrol.openingStock)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{fmtL(row.petrol.meterSales)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-500">
                          {row.petrol.impliedReceipts > 0 ? `+${fmtL(row.petrol.impliedReceipts)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtL(row.petrol.reportedClosing)}</td>
                        <td className="px-3 py-2 text-right">
                          <DipReadingCell
                            currentDip={row.petrol.dipReading}
                            currentDipStick={(row.petrol as any).dipStickReading ?? null}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <VarianceBadge variance={row.petrol.dipVariance} />
                        </td>
                        {/* Diesel */}
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtL(row.diesel.openingStock)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{fmtL(row.diesel.meterSales)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-500">
                          {row.diesel.impliedReceipts > 0 ? `+${fmtL(row.diesel.impliedReceipts)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtL(row.diesel.reportedClosing)}</td>
                        <td className="px-3 py-2 text-right">
                          <DipReadingCell
                            currentDip={row.diesel.dipReading}
                            currentDipStick={(row.diesel as any).dipStickReading ?? null}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <VarianceBadge variance={row.diesel.dipVariance} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                {summary && (
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-muted/30 font-semibold">
                      <td className="px-4 py-2 text-xs font-bold">TOTAL</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-400">{fmtL(summary.totalPetrolSales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-500">+{fmtL(summary.totalPetrolReceipts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-400">{fmtL(summary.totalDieselSales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-500">+{fmtL(summary.totalDieselReceipts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info note when no dip readings exist */}
      {rows && rows.length > 0 && !rows.some(r => r.petrol.dipReading !== null || r.diesel.dipReading !== null) && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold text-amber-400">No Dip Readings for this period. </span>
            Dip readings are recorded during shift close in <span className="font-semibold text-foreground">Nozzle Entry</span>.
          </div>
        </div>
      )}
    </div>
  );
}
