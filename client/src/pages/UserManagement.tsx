import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Shield, Clock, Mail, UserPlus, Copy, Trash2, CheckCircle2, AlertCircle, Hourglass } from "lucide-react";
import { format } from "date-fns";

const ROLE_OPTIONS = [
  { value: "admin",          label: "Admin",          description: "Full access — same as Owner" },
  { value: "accountant",     label: "Accountant",     description: "Full access — same as Admin" },
  { value: "incharge",       label: "Incharge",       description: "Operational + Customers/Expenses/Assets" },
  { value: "pump_attendant", label: "Pump Attendant", description: "Nozzle Entry only" },
  { value: "user",           label: "User",           description: "Nozzle Entry only (default)" },
] as const;

const INVITE_ROLE_OPTIONS = [
  { value: "accountant",     label: "Accountant" },
  { value: "incharge",       label: "Incharge" },
  { value: "pump_attendant", label: "Pump Attendant" },
  { value: "user",           label: "User" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  admin:          "bg-red-500/15 text-red-400 border-red-500/25",
  owner:          "bg-orange-500/15 text-orange-400 border-orange-500/25",
  accountant:     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  incharge:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  pump_attendant: "bg-green-500/15 text-green-400 border-green-500/25",
  user:           "bg-secondary text-muted-foreground border-border/50",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  accepted: "bg-green-500/15 text-green-400 border-green-500/25",
  revoked:  "bg-red-500/15 text-red-400 border-red-500/25",
  expired:  "bg-secondary text-muted-foreground border-border/50",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:  <Hourglass className="w-3 h-3" />,
  accepted: <CheckCircle2 className="w-3 h-3" />,
  revoked:  <AlertCircle className="w-3 h-3" />,
  expired:  <AlertCircle className="w-3 h-3" />,
};

export default function UserManagement() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"accountant" | "incharge" | "pump_attendant" | "user">("incharge");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const { data: users, isLoading, refetch: refetchUsers } = trpc.users.list.useQuery();
  const { data: invitations, refetch: refetchInvites } = trpc.invitations.list.useQuery();

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      refetchUsers();
    },
    onError: (err) => {
      toast.error("Failed to update role", { description: err.message });
    },
  });

  const createInvite = trpc.invitations.create.useMutation({
    onSuccess: (data) => {
      setGeneratedLink(data.inviteUrl);
      refetchInvites();
      toast.success("Invitation created", { description: `Invite link generated for ${inviteEmail}` });
    },
    onError: (err) => {
      toast.error("Failed to create invitation", { description: err.message });
    },
  });

  const revokeInvite = trpc.invitations.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      refetchInvites();
    },
    onError: (err) => {
      toast.error("Failed to revoke invitation", { description: err.message });
    },
  });

  const handleSendInvite = () => {
    if (!inviteEmail.trim() || !inviteRole) return;
    createInvite.mutate({
      email: inviteEmail.trim(),
      role: inviteRole,
      origin: window.location.origin,
    });
  };

  const handleCloseInviteDialog = () => {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("incharge");
    setGeneratedLink(null);
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied to clipboard");
  };

  const pendingInvites = invitations?.filter(i => i.status === "pending") ?? [];
  const pastInvites = invitations?.filter(i => i.status !== "pending") ?? [];

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> User Access Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage roles for all users who have signed in to Indhan, and invite new users by email.
          </p>
        </div>
        <Button size="sm" className="shrink-0 gap-2" onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
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

      {/* Registered Users */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Registered Users
            {users && <Badge variant="outline" className="text-[10px] ml-1">{users.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-secondary/40 animate-pulse" />)}
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No users have signed in yet.</div>
          ) : (
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{user.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{user.name ?? "Unknown"}</span>
                      {user.role === "owner" && (
                        <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/25">Station Owner</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {user.email && <span className="text-xs text-muted-foreground truncate">{user.email}</span>}
                      {user.lastSignedIn && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {format(new Date(user.lastSignedIn), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {user.role === "owner" ? (
                      <Badge variant="outline" className={`text-xs ${ROLE_COLORS["owner"]}`}>Owner</Badge>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => updateRole.mutate({ userId: user.id, role: newRole as "admin" | "accountant" | "incharge" | "pump_attendant" | "user" | "owner" })}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
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

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-yellow-400" />
              Pending Invitations
              <Badge variant="outline" className="text-[10px] ml-1 bg-yellow-500/10 text-yellow-400 border-yellow-500/25">{pendingInvites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{inv.email}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[inv.role]}`}>{inv.role.replace("_", " ")}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Expires {format(new Date(inv.expiresAt), "dd MMM yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Copy invite link"
                      onClick={() => copyLink(`${window.location.origin}/invite/${inv.token}`)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      title="Revoke invitation"
                      onClick={() => revokeInvite.mutate({ id: inv.id })}
                      disabled={revokeInvite.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past Invitations */}
      {pastInvites.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Invitation History</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              {pastInvites.slice(0, 10).map(inv => (
                <div key={inv.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/20">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground truncate">{inv.email}</span>
                      <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${STATUS_COLORS[inv.status]}`}>
                        {STATUS_ICONS[inv.status]} {inv.status}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {inv.role.replace("_", " ")} · Invited {format(new Date(inv.createdAt), "dd MMM yyyy")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={open => { if (!open) handleCloseInviteDialog(); else setInviteOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Invite New User
            </DialogTitle>
          </DialogHeader>

          {generatedLink ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/25 text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 inline mr-2" />
                Invitation created successfully! Share this link with the user:
              </div>
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="text-xs font-mono bg-secondary border-border/50" />
                <Button size="icon" variant="outline" onClick={() => copyLink(generatedLink)} title="Copy link">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The link expires in 72 hours. The user must sign in with their Manus account to accept the invitation.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseInviteDialog}>Close</Button>
                <Button onClick={() => { setGeneratedLink(null); setInviteEmail(""); }}>Send Another</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="staff@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="bg-secondary border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Assign Role</Label>
                <Select value={inviteRole} onValueChange={v => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger id="invite-role" className="bg-secondary border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLE_OPTIONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                An invite link will be generated. Share it with the user — they must sign in with their Manus account to accept. The link expires in 72 hours.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseInviteDialog}>Cancel</Button>
                <Button
                  onClick={handleSendInvite}
                  disabled={!inviteEmail.trim() || createInvite.isPending}
                  className="gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {createInvite.isPending ? "Generating..." : "Generate Invite Link"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
