import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { activityApi } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  Search,
  FileText,
  Download,
  Loader2,
  History,
  User,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: any;
  ip_address: string | null;
  created_at: string;
  tenant_id: string | null;
}

export default function AdminAuditLogs() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin, tenantId } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const canAccess = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (canAccess) {
      fetchAuditLogs();
    }
  }, [tenantId, canAccess]);

  const fetchAuditLogs = async () => {
    try {
      // The API joins the actor in, so no separate profiles lookup is needed.
      const entries = await activityApi.recentAudit(500);
      const data = entries.map((e) => ({ ...e, actor_email: e.actor_name }));

      if (data.length === 0) {
        setLogs(generateDemoLogs());
      } else {
        setLogs(data as unknown as AuditLog[]);
        // Show who acted, by name/email — resolved server-side.
        const map: Record<string, string> = {};
        data.forEach((l) => {
          if (l.user_id && l.actor_email) map[l.user_id] = l.actor_email;
        });
        setEmails(map);
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      // Show demo data on error
      setLogs(generateDemoLogs());
    } finally {
      setIsLoading(false);
    }
  };

  // Generate demo audit logs for demonstration
  const generateDemoLogs = (): AuditLog[] => {
    const now = new Date();
    const demoTenantId = "f99fbaa7-49b4-4d99-818e-c793f45c16f5";
    const demoLogs: AuditLog[] = [
      {
        id: "demo-1",
        user_id: "user-001",
        entity_type: "invoice",
        entity_id: "inv-001",
        action: "approved",
        metadata: { invoice_number: "INV-2024-001", amount: 15000, vendor: "Acme Corp" },
        ip_address: "192.168.1.100",
        created_at: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-2",
        user_id: "user-002",
        entity_type: "invoice",
        entity_id: "inv-002",
        action: "submitted",
        metadata: { invoice_number: "INV-2024-002", amount: 8500, vendor: "TechSupply Inc" },
        ip_address: "192.168.1.101",
        created_at: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-3",
        user_id: "user-001",
        entity_type: "vendor",
        entity_id: "vendor-001",
        action: "created",
        metadata: { vendor_name: "New Vendor LLC", status: "pending_verification" },
        ip_address: "192.168.1.100",
        created_at: new Date(now.getTime() - 1000 * 60 * 30).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-4",
        user_id: "user-003",
        entity_type: "invoice",
        entity_id: "inv-003",
        action: "exception",
        metadata: { invoice_number: "INV-2024-003", reason: "Routed to Trouble Team", amount: 25000 },
        ip_address: "192.168.1.102",
        created_at: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-5",
        user_id: "user-002",
        entity_type: "invoice",
        entity_id: "inv-004",
        action: "edited",
        metadata: { invoice_number: "INV-2024-004", changes: ["amount", "due_date"], vendor: "Global Services" },
        ip_address: "192.168.1.101",
        created_at: new Date(now.getTime() - 1000 * 60 * 90).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-6",
        user_id: "user-001",
        entity_type: "vendor",
        entity_id: "vendor-002",
        action: "approved",
        metadata: { vendor_name: "Verified Solutions", bank_verified: true },
        ip_address: "192.168.1.100",
        created_at: new Date(now.getTime() - 1000 * 60 * 120).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-7",
        user_id: "user-003",
        entity_type: "export",
        entity_id: "export-001",
        action: "exported",
        metadata: { format: "csv", invoice_count: 12, erp_system: "NetSuite" },
        ip_address: "192.168.1.102",
        created_at: new Date(now.getTime() - 1000 * 60 * 180).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-8",
        user_id: "user-002",
        entity_type: "invoice",
        entity_id: "inv-005",
        action: "rejected",
        metadata: { invoice_number: "INV-2024-005", reason: "Duplicate invoice detected" },
        ip_address: "192.168.1.101",
        created_at: new Date(now.getTime() - 1000 * 60 * 240).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-9",
        user_id: "user-001",
        entity_type: "settings",
        entity_id: "settings-001",
        action: "updated",
        metadata: { setting: "auto_approval_threshold", old_value: 70, new_value: 85 },
        ip_address: "192.168.1.100",
        created_at: new Date(now.getTime() - 1000 * 60 * 300).toISOString(),
        tenant_id: demoTenantId,
      },
      {
        id: "demo-10",
        user_id: "user-003",
        entity_type: "invoice",
        entity_id: "inv-006",
        action: "ingested",
        metadata: { invoice_number: "INV-2024-006", source: "email", sender: "billing@supplier.com" },
        ip_address: "system",
        created_at: new Date(now.getTime() - 1000 * 60 * 360).toISOString(),
        tenant_id: demoTenantId,
      },
    ];
    return demoLogs;
  };

  const getActionBadge = (action: string) => {
    const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      create: "default",
      update: "secondary",
      delete: "destructive",
      approve: "default",
      reject: "destructive",
      export: "outline",
      login: "secondary",
    };
    return (
      <Badge variant={actionColors[action.toLowerCase()] || "outline"}>
        {action}
      </Badge>
    );
  };

  const filteredLogs = logs.filter((log) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_id.toLowerCase().includes(searchLower) ||
      (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(searchLower))
    );
  });

  const exportToCSV = () => {
    const headers = ["Timestamp", "User ID", "Action", "Entity Type", "Entity ID", "IP Address", "Metadata"];
    const rows = filteredLogs.map((log) => [
      log.created_at,
      log.user_id || "",
      log.action,
      log.entity_type,
      log.entity_id,
      log.ip_address || "",
      log.metadata ? JSON.stringify(log.metadata) : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canAccess) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <History className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">Only administrators can view audit logs.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/poc/dashboard")}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Button>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
              <History className="h-8 w-8" />
              Audit Logs
            </h1>
            <p className="text-muted-foreground mt-1">
              System activity and change history
            </p>
          </div>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs by action, entity, or metadata..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Log ({filteredLogs.length})</CardTitle>
            <CardDescription>Recent system activity and changes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 opacity-50" />
                <p className="mt-4">No audit logs found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(log.created_at), "MMM dd, HH:mm:ss")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-mono">
                            {log.user_id ? (emails[log.user_id] || log.user_id.slice(0, 8)) : "System"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.entity_type}</Badge>
                        <span className="ml-2 text-xs font-mono text-muted-foreground">
                          {log.entity_id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {log.metadata ? JSON.stringify(log.metadata) : "-"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.ip_address || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
