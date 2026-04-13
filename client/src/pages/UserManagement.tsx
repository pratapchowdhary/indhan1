import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Shield, Clock } from "lucide-react";
import { format } from "date-fns";

const ROLE_OPTIONS = [
  { value: "admin",          label: "Admin",          description: "Full access — same as Owner" },
  { value: "accountant",     label: "Accountant",     description: "Full access — same as Admin" },
  { value: "incharge",       label: "Incharge",       description: "Operational + Customers/Expenses/Assets" },
  { value: "pump_attendant", label: "Pump Attendant", description: "Nozzle Entry only" },
  { value: "user",           label: "User",           description: "Nozzle Entry only (default)" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin:          "bg-red-500/15 text-red-400 border-red-500/25",
  owner:          "bg-orange-500/15 text-orange-400 border-orange-500/25",
  accountant:     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  incharge:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  pump_attendant: "bg-green-500/15 text-green-400 border-green-500/25",
  user:           "bg-secondary text-muted-foreground border-border/50",
};

export default function UserManagement() {
  const { data: users, isLoading, refetch } = trpc.users.list.useQuery();
  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to update role", { description: err.message });
    },
  });

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> User Access Management
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage roles for all users who have signed in to Indhan. Role changes take effect on next login.
        </p>
      </div>

      {/* Role Reference Card */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold">Access Level Reference</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ROLE_OPTIONS.map(r => (
              <div key={r.value} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/40 border border-border/30">
                <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 mt-0.5 ${ROLE_COLORS[r.value]}`}>
                  {r.label}
                </Badge>
                <span className="text-xs text-muted-foreground leading-relaxed">{r.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Registered Users
            {users && (
              <Badge variant="outline" className="text-[10px] ml-1">{users.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-lg bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No users have signed in yet.
            </div>
          ) : (
            <div className="space-y-2">
              {users.map(user => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </span>
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{user.name ?? "Unknown"}</span>
                      {user.role === "owner" && (
                        <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/25">
                          Station Owner
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {user.email && (
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      )}
                      {user.lastSignedIn && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {format(new Date(user.lastSignedIn), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Role selector */}
                  <div className="shrink-0">
                    {user.role === "owner" ? (
                      <Badge variant="outline" className={`text-xs ${ROLE_COLORS["owner"]}`}>
                        Owner
                      </Badge>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => {
                          updateRole.mutate({
                            userId: user.id,
                            role: newRole as "admin" | "accountant" | "incharge" | "pump_attendant" | "user",
                          });
                        }}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
