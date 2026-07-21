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
    path: "/v1/invoices",
    description: "List all invoices",
    parameters: [
      { name: "status", type: "string", description: "Filter by status (ingested, validated, exception, approved, rejected, exported)" },
      { name: "vendor_id", type: "string", description: "Filter by vendor ID" },
      { name: "from_date", type: "string", description: "Filter invoices from this date (ISO 8601)" },
      { name: "to_date", type: "string", description: "Filter invoices to this date (ISO 8601)" },
      { name: "limit", type: "integer", description: "Number of results to return (default: 20, max: 100)" },
      { name: "offset", type: "integer", description: "Number of results to skip" },
    ],
    response: `{
  "data": [
    {
      "id": "inv_abc123",
      "invoice_number": "INV-2024-001",
      "vendor": {
        "id": "vnd_xyz789",
        "name": "Acme Corp"
      },
      "invoice_date": "2024-01-15",
      "due_date": "2024-02-15",
      "currency": "USD",
      "subtotal_amount": 1000.00,
      "tax_amount": 80.00,
      "total_amount": 1080.00,
      "status": "approved",
      "risk_level": "low",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "has_more": true,
  "total_count": 150
}`,
  },
  {
    method: "GET",
    path: "/v1/invoices/{id}",
    description: "Retrieve an invoice",
    parameters: [
      { name: "id", type: "string", description: "The invoice ID", required: true },
    ],
    response: `{
  "id": "inv_abc123",
  "invoice_number": "INV-2024-001",
  "vendor": {
    "id": "vnd_xyz789",
    "name": "Acme Corp",
    "tax_id": "12-3456789"
  },
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-15",
  "currency": "USD",
  "subtotal_amount": 1000.00,
  "tax_amount": 80.00,
  "total_amount": 1080.00,
  "status": "approved",
  "risk_level": "low",
  "variation_score": 0.05,
  "variation_flags": [],
  "line_items": [
    {
      "line_number": 1,
      "description": "Consulting Services",
      "quantity": 10,
      "unit_price": 100.00,
      "line_total": 1000.00,
      "gl_code": "6100",
      "cost_center": "CC-100"
    }
  ],
  "anomalies": [],
  "erp_status": "posted",
  "erp_reference_id": "SAP-INV-49382",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-16T14:00:00Z"
}`,
  },
  {
    method: "POST",
    path: "/v1/invoices/{id}/approve",
    description: "Approve an invoice",
    parameters: [
      { name: "id", type: "string", description: "The invoice ID", required: true },
      { name: "comment", type: "string", description: "Optional approval comment" },
    ],
    response: `{
  "id": "inv_abc123",
  "status": "approved",
  "approved_by": "user_def456",
  "approved_at": "2024-01-16T14:00:00Z"
}`,
  },
  {
    method: "POST",
    path: "/v1/invoices/{id}/reject",
    description: "Reject an invoice",
    parameters: [
      { name: "id", type: "string", description: "The invoice ID", required: true },
      { name: "reason", type: "string", description: "Rejection reason", required: true },
    ],
    response: `{
  "id": "inv_abc123",
  "status": "rejected",
  "rejected_by": "user_def456",
  "rejected_at": "2024-01-16T14:00:00Z",
  "rejection_reason": "Duplicate invoice detected"
}`,
  },
];

export default function InvoicesApiDocs() {
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
          <h1 className="text-4xl font-bold tracking-tight">Invoices API</h1>
          <p className="text-xl text-muted-foreground">
            Create, retrieve, update, and manage invoices through the API.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>The Invoice Object</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The Invoice object represents an accounts payable invoice in Clarus AP. 
              Invoices progress through various statuses as they are processed through your workflow.
            </p>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">id</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Unique identifier</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">invoice_number</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Vendor's invoice number</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">status</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">ingested, validated, exception, approved, rejected, exported</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">total_amount</span>
                <span className="text-muted-foreground">number</span>
                <span className="text-muted-foreground">Total invoice amount</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">risk_level</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">low, medium, high</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {endpoints.map((endpoint, index) => (
          <Card key={index} id={endpoint.path.replace(/[{}\/]/g, '-')}>
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
