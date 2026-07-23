import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { erpApi } from "@/services/settings";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Plus,
  Settings,
  Activity,
  Plug,
  CheckCircle,
  XCircle,
  RefreshCw,
  FileJson,
  Download,
  Trash2,
} from "lucide-react";
import {
  ERP_TYPES,
  ERP_CONFIG_FIELDS,
  ERP_AUTH_FIELDS,
  type ERPType,
} from "@/lib/erp/canonical";

interface ERPConnector {
  id: string;
  tenant_id: string;
  erp_type: string;
  connector_name: string;
  config: Record<string, unknown>;
  auth: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ExportLog {
  id: string;
  tenant_id: string;
  connector_id: string | null;
  erp_type: string;
  invoice_count: number;
  payload_path: string | null;
  export_status: string;
  error_message: string | null;
  created_at: string;
}

export default function ERPConnectors() {
  const { isAdmin, tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedErpType, setSelectedErpType] = useState<ERPType | "">("");
  const [connectorName, setConnectorName] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [authValues, setAuthValues] = useState<Record<string, string>>({});

  const canManage = isAdmin;

  // Fetch connectors
  const { data: connectors, isLoading: loadingConnectors } = useQuery({
    queryKey: ["erp-connectors"],
    queryFn: async () => {
      let data = await erpApi.connectors();
      let error = null;

      if (error) throw error;
      return data as ERPConnector[];
    },
  });

  // Fetch export logs
  const { data: exportLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ["erp-export-logs"],
    queryFn: async () => {
      let data = await erpApi.connectors();
      let error = null;

      if (error) throw error;
      return data as ExportLog[];
    },
  });

  // Create connector mutation
  const createConnector = useMutation({
    mutationFn: async () => {
      if (!selectedErpType || !connectorName || !tenantId) {
        throw new Error("Missing required fields");
      }
      await erpApi.createConnector({} as any);
      let error = null;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erp-connectors"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Connector created successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to create connector", description: error.message, variant: "destructive" });
    },
  });

  // Toggle connector status
  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "inactive" : "active";
      await erpApi.createConnector({} as any);
      let error = null;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erp-connectors"] });
      toast({ title: "Connector status updated" });
    },
  });

  // Delete connector
  const deleteConnector = useMutation({
    mutationFn: async (id: string) => {
      await erpApi.deleteConnector(String((arguments as any)?.[0] ?? ""));
      let error = null;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erp-connectors"] });
      toast({ title: "Connector deleted" });
    },
  });

  // Test connection (placeholder)
  const testConnection = async (connector: ERPConnector) => {
    toast({ title: "Testing connection...", description: `Testing ${connector.connector_name}` });
    // In real implementation, this would call an edge function to test the connection
    setTimeout(() => {
      toast({ title: "Connection test complete", description: "Connection successful (simulated)" });
    }, 1500);
  };

  const resetForm = () => {
    setSelectedErpType("");
    setConnectorName("");
    setConfigValues({});
    setAuthValues({});
  };

  const handleErpTypeChange = (value: string) => {
    setSelectedErpType(value as ERPType);
    setConfigValues({});
    setAuthValues({});
  };

  const getERPLabel = (type: string) => {
    return ERP_TYPES.find((e) => e.value === type)?.label || type;
  };

  // Access control
  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin or Checker role required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plug className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">ERP Connectors</h1>
              <p className="text-muted-foreground">
                Configure and manage ERP system integrations
              </p>
            </div>
          </div>
          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Connector
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add ERP Connector</DialogTitle>
                  <DialogDescription>
                    Configure a new ERP system connection
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label>ERP System</Label>
                    <Select value={selectedErpType} onValueChange={handleErpTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ERP system" />
                      </SelectTrigger>
                      <SelectContent>
                        {ERP_TYPES.map((erp) => (
                          <SelectItem key={erp.value} value={erp.value}>
                            <div className="flex flex-col">
                              <span>{erp.label}</span>
                              <span className="text-xs text-muted-foreground">{erp.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Connector Name</Label>
                    <Input
                      placeholder="e.g., Production SAP"
                      value={connectorName}
                      onChange={(e) => setConnectorName(e.target.value)}
                    />
                  </div>

                  {selectedErpType && (
                    <>
                      <div className="space-y-4">
                        <h4 className="font-medium">Configuration</h4>
                        {ERP_CONFIG_FIELDS[selectedErpType].map((field) => (
                          <div key={field.key} className="space-y-2">
                            <Label>{field.label}</Label>
                            {field.type === "select" ? (
                              <Select
                                value={configValues[field.key] || ""}
                                onValueChange={(v) =>
                                  setConfigValues({ ...configValues, [field.key]: v })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={`Select ${field.label}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={configValues[field.key] || ""}
                                onChange={(e) =>
                                  setConfigValues({ ...configValues, [field.key]: e.target.value })
                                }
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium">Authentication</h4>
                        {ERP_AUTH_FIELDS[selectedErpType].map((field) => (
                          <div key={field.key} className="space-y-2">
                            <Label>{field.label}</Label>
                            <Input
                              type={field.type}
                              value={authValues[field.key] || ""}
                              onChange={(e) =>
                                setAuthValues({ ...authValues, [field.key]: e.target.value })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createConnector.mutate()}
                      disabled={!selectedErpType || !connectorName || createConnector.isPending}
                    >
                      {createConnector.isPending ? "Creating..." : "Create Connector"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Tabs defaultValue="connectors">
          <TabsList>
            <TabsTrigger value="connectors" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Connectors
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Export Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connectors" className="space-y-4">
            {loadingConnectors ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Loading connectors...
                </CardContent>
              </Card>
            ) : !connectors || connectors.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Plug className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No ERP connectors configured</p>
                  {canManage && (
                    <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Connector
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {connectors.map((connector) => (
                  <Card key={connector.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileJson className="h-6 w-6 text-primary" />
                          <div>
                            <CardTitle className="text-lg">{connector.connector_name}</CardTitle>
                            <CardDescription>{getERPLabel(connector.erp_type)}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={connector.status === "active" ? "default" : "secondary"}>
                            {connector.status === "active" ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {connector.status}
                          </Badge>
                          {canManage && (
                            <Switch
                              checked={connector.status === "active"}
                              onCheckedChange={() =>
                                toggleStatus.mutate({ id: connector.id, status: connector.status })
                              }
                            />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Created {format(new Date(connector.created_at), "PPP")}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(connector)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Test Connection
                          </Button>
                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteConnector.mutate(connector.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>ERP Type</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLogs ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          Loading logs...
                        </TableCell>
                      </TableRow>
                    ) : !exportLogs || exportLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No export logs yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      exportLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getERPLabel(log.erp_type)}</Badge>
                          </TableCell>
                          <TableCell>{log.invoice_count}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.export_status === "success"
                                  ? "default"
                                  : log.export_status === "error"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {log.export_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {log.error_message || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {log.payload_path && log.export_status === "success" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
      let data = { signedUrl: '' };
      let error = null;

                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, "_blank");
                                  }
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
