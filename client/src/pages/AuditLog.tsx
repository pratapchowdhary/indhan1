import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Search, Filter, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const ACTION_COLORS: Record<string, string> = {
  create:      "bg-green-500/15 text-green-400 border-green-500/25",
  update:      "bg-blue-500/15 text-blue-400 border-blue-500/25",
  delete:      "bg-red-500/15 text-red-400 border-red-500/25",
  approve:     "bg-purple-500/15 text-purple-400 border-purple-500/25",
  reject:      "bg-orange-500/15 text-orange-400 border-orange-500/25",
  login:       "bg-secondary text-muted-foreground border-border/50",
  logout:      "bg-secondary text-muted-foreground border-border/50",
  role_change: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  invite:      "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  revoke:      "bg-red-500/15 text-red-400 border-red-500/25",
};

const MODULE_LABELS: Record<string, string> = {
  expenses:      "Expenses",
  bank:          "Bank",
  users:         "Users",
  invitations:   "Invitations",
  nozzle:        "Nozzle",
  customers:     "Customers",
  fuel_prices:   "Fuel Prices",
  cash_handover: "Cash Handover",
  payroll:       "Payroll",
  settings:      "Settings",
  assets:        "Assets",
};

const ROLE_COLORS: Record<string, string> = {
  admin:          "bg-red-500/15 text-red-400 border-red-500/25",
  owner:          "bg-orange-500/15 text-orange-400 border-orange-500/25",
  accountant:     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  incharge:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  pump_attendant: "bg-green-500/15 text-green-400 border-green-500/25",
  user:           "bg-secondary text-muted-foreground border-border/50",
};

const PAGE_SIZE = 25;

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [searchUser, setSearchUser] = useState("");
  const [filterModule, setFilterModule] = useState("all");
  const [filterAction, setFilterAction] = useState("all");

  const { data, isLoading } = trpc.auditLog.list.useQuery({
    page: page + 1,
    pageSize: PAGE_SIZE,
    module: filterModule !== "all" ? filterModule : undefined,
    action: filterAction !== "all" ? filterAction : undefined,
    search: searchUser.trim() || undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs: any[] = (data as any)?.logs ?? [];
  const total: number = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const resetPage = () => setPage(0);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" /> Audit Log
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Complete trail of all actions performed by Admins and Accountants in the system.
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border/50">
        <CardContent className="px-5 py-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by user name..."
                  value={searchUser}
                  onChange={e => { setSearchUser(e.target.value); resetPage(); }}
                  className="pl-8 h-9 text-sm bg-secondary border-border/50"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={filterModule} onValueChange={v => { setFilterModule(v); resetPage(); }}>
                <SelectTrigger className="w-36 h-9 text-xs bg-secondary border-border/50">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {Object.entries(MODULE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAction} onValueChange={v => { setFilterAction(v); resetPage(); }}>
                <SelectTrigger className="w-32 h-9 text-xs bg-secondary border-border/50">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {Object.keys(ACTION_COLORS).map(a => (
                    <SelectItem key={a} value={a}>{a.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {total > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                {total} record{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            Activity Records
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No audit records found.</p>
              {(filterModule !== "all" || filterAction !== "all" || searchUser) && (
                <p className="text-xs mt-1">Try adjusting your filters.</p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-secondary/25 border border-border/25 hover:bg-secondary/40 transition-colors"
                >
                  {/* User avatar */}
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">
                      {(log.userName ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{log.userName ?? "Unknown"}</span>
                      <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[log.userRole ?? ""] ?? ROLE_COLORS["user"]}`}>
                        {(log.userRole ?? "user").replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${ACTION_COLORS[log.action] ?? "bg-secondary text-muted-foreground border-border/50"}`}>
                        {log.action.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] bg-secondary text-muted-foreground border-border/40">
                        {MODULE_LABELS[log.module] ?? log.module}
                      </Badge>
                      {log.resourceId && (
                        <span className="text-[10px] text-muted-foreground">#{log.resourceId}</span>
                      )}
                    </div>
                    {log.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(log.createdAt), "dd MMM yyyy")}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 gap-1 text-xs"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 gap-1 text-xs"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
