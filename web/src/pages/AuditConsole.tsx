import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "@/services";
import { format } from "date-fns";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, Search, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface AuditLog {
  id: string;
  created_at: string;
  tenant_id: string | null;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  actor_email?: string | null;
}

const ENTITY_TYPES = ["invoice", "vendor", "user", "erp_settings", "export", "reconciliation", "auth"];
const ACTIONS = ["created", "updated", "deleted", "approved", "rejected", "exported", "posted", "paid", "login", "logout", "config_changed"];

export default function AuditConsole() {
  const { isAdmin } = useAuth();
  const [filters, setFilters] = useState({
    entityType: "",
    action: "",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      // Filtering is applied client-side; the API returns the recent window with
      // the actor already joined, so there is no second lookup.
      const entries = await activityApi.recentAudit(500);

      return entries
        .filter((l) => !filters.entityType || l.entity_type === filters.entityType)
        .filter((l) => !filters.action || l.action === filters.action)
        .filter((l) => !filters.dateFrom || l.created_at >= filters.dateFrom)
        .filter((l) => !filters.dateTo || l.created_at <= filters.dateTo + "T23:59:59")
        .filter(
          (l) =>
            !filters.search ||
            (l.entity_id ?? "").toLowerCase().includes(filters.search.toLowerCase())
        )
        .map((l) => ({ ...l, actor_email: l.actor_name })) as unknown as AuditLog[];
    },
  });

  const handleExport = (format: "csv" | "json") => {
    if (!logs) return;

    const exportData = logs.map((log) => ({
      timestamp: log.created_at,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      user_id: log.user_id,
      ip_address: log.ip_address,
      metadata: JSON.stringify(log.metadata),
    }));

    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === "csv") {
      const headers = Object.keys(exportData[0] || {}).join(",");
      const rows = exportData.map((row) => Object.values(row).join(","));
      content = [headers, ...rows].join("\n");
      mimeType = "text/csv";
      filename = `audit-logs-${format}-${Date.now()}.csv`;
    } else {
      content = JSON.stringify(exportData, null, 2);
      mimeType = "application/json";
      filename = `audit-logs-${Date.now()}.json`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "approved":
      case "posted":
      case "paid":
        return "default";
      case "rejected":
      case "deleted":
        return "destructive";
      case "created":
      case "exported":
        return "secondary";
      default:
        return "outline";
    }
  };

  // Superadmin, Admin, and Checker can access
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin or Checker privileges required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Audit Console</h1>
              <p className="text-muted-foreground">
                Immutable audit trail for SOC 2 compliance
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>Entity Type</Label>
                <Select
                  value={filters.entityType || "all"}
                  onValueChange={(v) => setFilters({ ...filters, entityType: v === "all" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {ENTITY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Action</Label>
                <Select
                  value={filters.action || "all"}
                  onValueChange={(v) => setFilters({ ...filters, action: v === "all" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {ACTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                />
              </div>
              <div>
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                />
              </div>
              <div>
                <Label>Search Entity ID</Label>
                <Input
                  placeholder="Search..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading audit logs...
                    </TableCell>
                  </TableRow>
                ) : !logs || logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.entity_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-[150px] truncate">
                        {log.entity_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-[100px] truncate">
                        {(log as any).actor_email || log.user_id || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.ip_address || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Audit Log Details</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-muted-foreground">ID</Label>
                                  <p className="font-mono text-sm">{log.id}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">Timestamp</Label>
                                  <p>{format(new Date(log.created_at), "PPpp")}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">Entity Type</Label>
                                  <p>{log.entity_type}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">Entity ID</Label>
                                  <p className="font-mono text-sm break-all">{log.entity_id}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">Action</Label>
                                  <p>{log.action}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">User ID</Label>
                                  <p className="font-mono text-sm">{(log as any).actor_email || log.user_id || "System"}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">IP Address</Label>
                                  <p className="font-mono">{log.ip_address || "N/A"}</p>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">User Agent</Label>
                                  <p className="text-sm truncate">{log.user_agent || "N/A"}</p>
                                </div>
                              </div>
                              <div>
                                <Label className="text-muted-foreground">Metadata</Label>
                                <pre className="mt-2 p-4 bg-muted rounded-lg overflow-auto max-h-[200px] text-sm">
                                  {JSON.stringify(log.metadata, null, 2) || "{}"}
                                </pre>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
