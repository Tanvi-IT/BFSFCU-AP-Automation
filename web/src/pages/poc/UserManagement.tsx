import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { usersApi } from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserPlus, Shield, Users, KeyRound } from "lucide-react";

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = { admin: "Admin", user: "User" };
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-blue-50 text-blue-700 border-blue-200",
  user: "bg-slate-50 text-slate-700 border-slate-200",
};

export default function UserManagement() {
  const { isAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      setUsers((await usersApi.list()) as unknown as AppUser[]);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load users", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async () => {
    if (!newEmail || !newPassword) {
      toast({ variant: "destructive", title: "Email and password are required" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Password must be at least 8 characters" });
      return;
    }
    setAdding(true);
    try {
      await usersApi.create({
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        fullName: newFullName.trim() || undefined,
      });
      toast({ title: "User created", description: `${newEmail} added as ${ROLE_LABELS[newRole]}` });
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setNewRole("user");
      fetchUsers();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create user", description: (err as Error).message });
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string, newRoleValue: string) => {
    try {
      await usersApi.update(userId, { role: newRoleValue as "admin" | "user" });
      toast({ title: "Role updated" });
      fetchUsers();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update role", description: (err as Error).message });
    }
  };

  const handleResetPassword = async (userId: string, email: string) => {
    const pw = window.prompt(`Set a new password for ${email} (min 8 characters):`);
    if (!pw) return;
    if (pw.length < 8) {
      toast({ variant: "destructive", title: "Password must be at least 8 characters" });
      return;
    }
    try {
      await usersApi.update(userId, { password: pw });
      toast({ title: "Password reset", description: `${email}'s password was changed.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to reset password", description: (err as Error).message });
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
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to remove user", description: (err as Error).message });
    } finally {
      setRemovingId(null);
    }
  };

  if (!isAdmin) {
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
              autoComplete="off"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
            />
            <Input
              placeholder="Full name (optional)"
              type="text"
              autoComplete="off"
              value={newFullName}
              onChange={e => setNewFullName(e.target.value)}
            />
            <Input
              placeholder="Initial password (min 8 characters)"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "user")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
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
            <h2 className="font-semibold">Current Users ({users.length})</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="divide-y">
              {users.map(u => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <div key={u.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium text-sm">{u.full_name || u.email}</p>
                      {u.full_name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                      {!u.is_active && <Badge variant="outline" className="mt-1 text-xs">Deactivated</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      {isSelf ? (
                        <Badge className={`text-xs border ${ROLE_COLORS[u.role] || ""}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      ) : (
                        <Select value={u.role} onValueChange={val => handleRoleChange(u.id, val)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Reset password"
                        onClick={() => handleResetPassword(u.id, u.email)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {!isSelf && u.is_active && (
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
