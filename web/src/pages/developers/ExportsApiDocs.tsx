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
    method: "GET",
    path: "/v1/exports",
    description: "List export history",
    parameters: [
      { name: "status", type: "string", description: "Filter by status (pending, completed, failed)" },
      { name: "erp_system", type: "string", description: "Filter by ERP system" },
      { name: "from_date", type: "string", description: "Filter from this date (ISO 8601)" },
      { name: "to_date", type: "string", description: "Filter to this date (ISO 8601)" },
      { name: "limit", type: "integer", description: "Number of results to return (default: 20, max: 100)" },
    ],
    response: `{
  "data": [
    {
      "id": "exp_abc123",
      "erp_system": "netsuite",
      "export_format": "json",
      "delivery_method": "api",
      "status": "completed",
      "invoice_count": 15,
      "invoice_ids": ["inv_1", "inv_2", "inv_3"],
      "file_url": "https://storage.clarusap.com/exports/exp_abc123.json",
      "push_status": "delivered",
      "created_at": "2024-01-20T02:00:00Z"
    }
  ],
  "has_more": true,
  "total_count": 45
}`,
  },
  {
    method: "GET",
    path: "/v1/exports/{id}",
    description: "Retrieve an export",
    parameters: [
      { name: "id", type: "string", description: "The export ID", required: true },
    ],
    response: `{
  "id": "exp_abc123",
  "erp_system": "netsuite",
  "export_format": "json",
  "delivery_method": "api",
  "status": "completed",
  "invoice_ids": ["inv_1", "inv_2", "inv_3"],
  "file_url": "https://storage.clarusap.com/exports/exp_abc123.json",
  "push_status": "delivered",
  "push_attempts": 1,
  "push_last_attempt_at": "2024-01-20T02:01:00Z",
  "reconciliation_events": [
    {
      "event_type": "delivered",
      "erp_reference_id": "NS-BATCH-4928",
      "created_at": "2024-01-20T02:01:30Z"
    }
  ],
  "created_at": "2024-01-20T02:00:00Z"
}`,
  },
  {
    method: "POST",
    path: "/v1/exports/schedule",
    description: "Schedule a manual export",
    parameters: [
      { name: "invoice_ids", type: "array", description: "Array of invoice IDs to export", required: true },
      { name: "erp_system", type: "string", description: "Target ERP system (sap, oracle, netsuite, dynamics, odoo, workday)" },
      { name: "export_format", type: "string", description: "Export format (json, csv, xml)" },
      { name: "delivery_method", type: "string", description: "Delivery method (manual, email, sftp, api)" },
    ],
    response: `{
  "id": "exp_new456",
  "erp_system": "sap",
  "export_format": "json",
  "delivery_method": "api",
  "status": "pending",
  "invoice_ids": ["inv_1", "inv_2"],
  "created_at": "2024-01-20T15:30:00Z",
  "message": "Export scheduled successfully. Processing will begin shortly."
}`,
  },
  {
    method: "GET",
    path: "/v1/invoices/{id}/exports",
    description: "List exports for an invoice",
    parameters: [
      { name: "id", type: "string", description: "The invoice ID", required: true },
    ],
    response: `{
  "data": [
    {
      "id": "exp_abc123",
      "erp_system": "netsuite",
      "status": "completed",
      "push_status": "delivered",
      "erp_reference_id": "NS-INV-49382",
      "created_at": "2024-01-20T02:00:00Z"
    }
  ]
}`,
  },
];

export default function ExportsApiDocs() {
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
          <h1 className="text-4xl font-bold tracking-tight">Exports API</h1>
          <p className="text-xl text-muted-foreground">
            Trigger exports, monitor delivery status, and retrieve export history.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>The Export Object</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The Export object represents a batch export of invoices to an ERP system. Exports track 
              the delivery status and reconciliation events from the target ERP.
            </p>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">id</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Unique identifier</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">erp_system</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Target ERP system</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">status</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">pending, completed, failed</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">push_status</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">pending, delivered, failed</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">delivery_method</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">manual, email, sftp, api</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {endpoints.map((endpoint, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge 
                  variant={endpoint.method === "GET" ? "secondary" : "default"}
                  className={endpoint.method === "POST" ? "bg-emerald-500" : ""}
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
