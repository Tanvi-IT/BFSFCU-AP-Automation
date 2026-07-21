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
    path: "/v1/vendors",
    description: "List all vendors",
    parameters: [
      { name: "status", type: "string", description: "Filter by status (active, inactive, pending_verification)" },
      { name: "search", type: "string", description: "Search by name or tax ID" },
      { name: "limit", type: "integer", description: "Number of results to return (default: 20, max: 100)" },
      { name: "offset", type: "integer", description: "Number of results to skip" },
    ],
    response: `{
  "data": [
    {
      "id": "vnd_xyz789",
      "name": "Acme Corporation",
      "tax_id": "12-3456789",
      "email_domain": "acme.com",
      "bank_account": "****4567",
      "bank_verified": true,
      "status": "active",
      "source": "erp_sync",
      "invoice_count": 45,
      "total_spend": 125000.00,
      "created_at": "2023-06-15T10:30:00Z"
    }
  ],
  "has_more": true,
  "total_count": 250
}`,
  },
  {
    method: "GET",
    path: "/v1/vendors/{id}",
    description: "Retrieve a vendor",
    parameters: [
      { name: "id", type: "string", description: "The vendor ID", required: true },
    ],
    response: `{
  "id": "vnd_xyz789",
  "name": "Acme Corporation",
  "tax_id": "12-3456789",
  "email_domain": "acme.com",
  "bank_account": "****4567",
  "bank_verified": true,
  "status": "active",
  "source": "erp_sync",
  "external_id": "V-10045",
  "baseline": {
    "avg_invoice_amount": 2750.00,
    "std_dev_amount": 450.00,
    "invoice_count": 45,
    "last_currency": "USD",
    "last_gl_codes": ["6100", "6200"]
  },
  "created_at": "2023-06-15T10:30:00Z",
  "updated_at": "2024-01-10T08:00:00Z"
}`,
  },
  {
    method: "POST",
    path: "/v1/vendors",
    description: "Create a vendor",
    parameters: [
      { name: "name", type: "string", description: "Vendor name", required: true },
      { name: "tax_id", type: "string", description: "Tax identification number" },
      { name: "email_domain", type: "string", description: "Primary email domain" },
      { name: "bank_account", type: "string", description: "Bank account number" },
      { name: "external_id", type: "string", description: "External reference ID (e.g., ERP vendor code)" },
    ],
    response: `{
  "id": "vnd_new123",
  "name": "New Vendor Inc",
  "tax_id": "98-7654321",
  "email_domain": "newvendor.com",
  "bank_account": "****9876",
  "bank_verified": false,
  "status": "pending_verification",
  "source": "api",
  "created_at": "2024-01-20T15:00:00Z"
}`,
  },
  {
    method: "PATCH",
    path: "/v1/vendors/{id}",
    description: "Update a vendor",
    parameters: [
      { name: "id", type: "string", description: "The vendor ID", required: true },
      { name: "name", type: "string", description: "Vendor name" },
      { name: "status", type: "string", description: "Vendor status (active, inactive)" },
      { name: "bank_account", type: "string", description: "Bank account number" },
    ],
    response: `{
  "id": "vnd_xyz789",
  "name": "Acme Corporation Updated",
  "status": "active",
  "updated_at": "2024-01-20T16:00:00Z"
}`,
  },
];

export default function VendorsApiDocs() {
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
          <h1 className="text-4xl font-bold tracking-tight">Vendors API</h1>
          <p className="text-xl text-muted-foreground">
            Manage vendor records, verification status, and baseline data.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>The Vendor Object</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The Vendor object represents a supplier or vendor in Clarus AP. Vendors are automatically 
              created during invoice ingestion or can be synced from your ERP system.
            </p>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">id</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Unique identifier</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">name</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Vendor's business name</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">tax_id</span>
                <span className="text-muted-foreground">string</span>
                <span className="text-muted-foreground">Tax identification number</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2">
                <span className="font-mono">status</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">active, inactive, pending_verification</span>
              </div>
              <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded">
                <span className="font-mono">source</span>
                <span className="text-muted-foreground">enum</span>
                <span className="text-muted-foreground">manual, auto, erp_sync, api</span>
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
                  className={
                    endpoint.method === "POST" ? "bg-emerald-500" : 
                    endpoint.method === "PATCH" ? "bg-amber-500" : ""
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
