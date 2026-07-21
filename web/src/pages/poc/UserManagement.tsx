import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usersApi } from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserPlus, Shield, Users } from "lucide-react";

interface AppUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

// Keys are the stored role values. "ap_origination" was never a real role —
// the enum has ap_analyst — so those entries never matched anything.
const ROLE_LABELS: Record<string, string> = {
  "pp-admin": "Admin",
  "pp-ap_analyst": "AP Origination",
  "pp-approver": "Approver",
  "pp-read_only": "Read Only",
  "pp-superadmin": "Super Admin",
};

const ROLE_COLORS: Record<string, string> = {
  "pp-admin": "bg-blue-50 text-blue-700 border-blue-200",
  "pp-ap_analyst": "bg-amber-50 text-amber-700 border-amber-200",
  "pp-approver": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "pp-read_only": "bg-slate-50 text-slate-700 border-slate-200",
  "pp-superadmin": "bg-purple-50 text-purple-700 border-purple-200",
};

export default function UserManagement() {
  const { isAdmin, isSuperAdmin, tenantId } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newEntraOid, setNewEntraOid] = useState("");
  const [newRole, setNewRole] = useState("pp-ap_analyst");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    return () => {
      setNewEmail("");
      setNewEntraOid("");
      setNewRole("pp-ap_analyst");
    };
  }, []);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setUsers((await usersApi.list()) as any);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to load users", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [tenantId]);

  const handleAdd = async () => {
    if (!newEmail || !newEntraOid) {
      toast({ variant: "destructive", title: "Email and Entra Object ID required" });
      return;
    }
    setAdding(true);
    try {
      // Entra owns identity: we grant an EXISTING directory user access to this
      // application rather than creating an account with a password.
      await usersApi.create({
        entraOid: newEntraOid.trim(),
        email: newEmail.trim(),
        role: newRole as any,
      });
      toast({ title: "Access granted", description: `${newEmail} added as ${ROLE_LABELS[newRole]}` });
      setNewEmail("");
      setNewEntraOid("");
      setNewRole("pp-ap_analyst");
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to create user", description: err.message });
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string, newRoleValue: string) => {
    try {
      await usersApi.update(userId, { role: newRoleValue as any });
      toast({ title: "Role updated" });
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to update role", description: err.message });
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email}'s access? Their audit history is retained.`)) return;
    setRemovingId(userId);
    try {
      // Deactivate rather than delete: audit entries reference the user, and a
      // financial audit trail must not lose its actor.
      await usersApi.update(userId, { isActive: false });
      toast({ title: "Access removed", description: `${email} can no longer sign in.` });
      fetchUsers();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to remove user", description: err.message });
    } finally {
      setRemovingId(null);
    }
  };

  if (!isAdmin && !isSuperAdmin) {
    return <Layout><div className="p-8 text-center text-muted-foreground">Access denied — Admin only.</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-8">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">Add, remove, and manage user roles</p>
          </div>
        </div>

        {/* Add User */}
        <div className="border rounded-lg p-6 mb-8 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Add New User</h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <Input
              placeholder="Email address"
              type="email"
              name="new-user-email"
              autoComplete="off"
              readOnly
              onFocus={e => e.target.removeAttribute("readonly")}
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <Input
              placeholder="Entra Object ID (GUID from Entra > Users)"
              type="text"
              name="new-user-entra-oid"
              autoComplete="off"
              readOnly
              onFocus={e => e.target.removeAttribute("readonly")}
              value={newEntraOid}
              onChange={e => setNewEntraOid(e.target.value)}
            />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pp-ap_analyst">AP Origination</SelectItem>
                <SelectItem value="pp-approver">Approver</SelectItem>
                <SelectItem value="pp-read_only">Read Only</SelectItem>
                <SelectItem value="pp-admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={adding} className="w-full">
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Add User
            </Button>
          </div>
        </div>

        {/* User List */}
        <div className="border rounded-lg bg-card">
          <div className="flex items-center gap-2 px-6 py-4 border-b">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Current Users ({users.filter(u => u.role !== 'pp-superadmin').length})</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="divide-y">
              {users.filter(u => u.role !== 'pp-superadmin').map(u => (
                <div key={u.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-sm">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {u.role === 'pp-superadmin' ? (
                      <Badge className={`text-xs border ${ROLE_COLORS[u.role] || ''}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </Badge>
                    ) : (
                      <Select value={u.role} onValueChange={val => handleRoleChange(u.id, val)}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pp-ap_analyst">AP Origination</SelectItem>
                          <SelectItem value="pp-approver">Approver</SelectItem>
                          <SelectItem value="pp-read_only">Read Only</SelectItem>
                          <SelectItem value="pp-admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {u.role !== 'pp-superadmin' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemove(u.id, u.email)}
                        disabled={removingId === u.id}
                      >
                        {removingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
