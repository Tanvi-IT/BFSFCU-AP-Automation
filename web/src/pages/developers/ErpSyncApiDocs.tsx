import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isPocTenant } from "@/lib/pocConfig";

const endpoints = [
  {
    method: "POST",
    path: "/v1/erp/sync",
    description: "Trigger ERP master data sync",
    parameters: [
      { name: "resources", type: "array", description: "Resources to sync: vendors, gl_accounts, cost_centers, departments, tax_codes, payment_terms" },
      { name: "full_sync", type: "boolean", description: "If true, performs full sync instead of incremental (default: false)" },
    ],
    response: `{
  "sync_id": "sync_abc123",
  "status": "in_progress",
  "resources_requested": ["vendors", "gl_accounts", "cost_centers"],
  "started_at": "2024-01-20T15:30:00Z",
  "message": "Sync initiated successfully. Check status for progress."
}`,
  },
  {
    method: "GET",
    path: "/v1/erp/sync/{sync_id}",
    description: "Get sync status",
    parameters: [
      { name: "sync_id", type: "string", description: "The sync ID", required: true },
    ],
    response: `{
  "sync_id": "sync_abc123",
  "status": "completed",
  "erp_system": "netsuite",
  "synced_vendors": 150,
  "synced_gl_accounts": 245,
  "synced_cost_centers": 32,
  "synced_departments": 15,
  "synced_tax_codes": 8,
  "synced_payment_terms": 5,
  "started_at": "2024-01-20T15:30:00Z",
  "completed_at": "2024-01-20T15:32:45Z"
}`,
  },
  {
    method: "GET",
    path: "/v1/erp/mappings",
    description: "List field mappings",
    parameters: [
      { name: "erp_system", type: "string", description: "Filter by ERP system" },
    ],
    response: `{
  "data": [
    {
      "id": "map_abc123",
      "canonical_field": "vendor_id",
      "erp_field": "SupplierID",
      "erp_system": "netsuite",
      "confidence": 0.95,
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "id": "map_def456",
      "canonical_field": "invoice_number",
      "erp_field": "VendorInvoiceNumber",
      "erp_system": "netsuite",
      "confidence": 1.0,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}`,
  },
  {
    method: "PUT",
    path: "/v1/erp/mappings",
    description: "Update field mappings",
    parameters: [
      { name: "mappings", type: "array", description: "Array of mapping objects", required: true },
    ],
    response: `{
  "updated": 5,
  "created": 2,
  "message": "Field mappings updated successfully"
}`,
  },
];

export default function ErpSyncApiDocs() {
  const navigate = useNavigate();
  const { tenantId, isSuperAdmin } = useAuth();
  const isPoc = isPocTenant(tenantId) && !isSuperAdmin;

  const handleBack = () => {
    navigate(isPoc ? "/poc/dashboard" : "/");
  };

  return (
    <DeveloperLayout>
      <div className="space-y-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {isPoc ? "Back to Dashboard" : "Back to Home"}
        </Button>

        <div className="space-y-4">
          <Badge variant="secondary">API Reference</Badge>
          <h1 className="text-4xl font-bold tracking-tight">ERP Sync API</h1>
          <p className="text-xl text-muted-foreground">
            Synchronize master data with your ERP system and manage field mappings.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ERP Master Data Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Clarus AP supports bidirectional synchronization with your ERP system. The ERP Sync API 
              allows you to trigger manual syncs and manage field mappings between Clarus AP's canonical 
              data model and your ERP's data structure.
            </p>
            <div className="space-y-2">
              <h4 className="font-medium">Supported Resources</h4>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-sm">
                <li><code className="bg-muted px-1 rounded">vendors</code> - Vendor master records</li>
                <li><code className="bg-muted px-1 rounded">gl_accounts</code> - General ledger accounts</li>
                <li><code className="bg-muted px-1 rounded">cost_centers</code> - Cost center definitions</li>
                <li><code className="bg-muted px-1 rounded">departments</code> - Department structure</li>
                <li><code className="bg-muted px-1 rounded">tax_codes</code> - Tax code definitions</li>
                <li><code className="bg-muted px-1 rounded">payment_terms</code> - Payment terms</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supported ERP Systems</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {["SAP S/4HANA", "Oracle Fusion", "NetSuite", "Microsoft Dynamics 365", "Odoo", "Workday Finance", "Jack Henry", "FIS", "Fiserv"].map((erp) => (
                <div key={erp} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-sm font-medium">{erp}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {endpoints.map((endpoint, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge 
                  variant={endpoint.method === "GET" ? "secondary" : "default"}
                  className={
                    endpoint.method === "POST" ? "bg-emerald-500" : 
                    endpoint.method === "PUT" ? "bg-amber-500" : ""
                  }
                >
                  {endpoint.method}
                </Badge>
                <code className="font-mono text-sm">{endpoint.path}</code>
              </div>
              <CardTitle className="text-lg mt-2">{endpoint.description}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Parameters</h4>
                  <div className="space-y-2">
                    {endpoint.parameters.map((param, i) => (
                      <div key={i} className="flex items-start gap-4 text-sm p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          <code className="font-mono">{param.name}</code>
                          {param.required && <Badge variant="destructive" className="text-xs">required</Badge>}
                        </div>
                        <span className="text-muted-foreground">{param.type}</span>
                        <span className="text-muted-foreground flex-1">{param.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-medium">Response</h4>
                <Tabs defaultValue="json" className="w-full">
                  <TabsList>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                  </TabsList>
                  <TabsContent value="json">
                    <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                      <pre className="text-muted-foreground">{endpoint.response}</pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DeveloperLayout>
  );
}
