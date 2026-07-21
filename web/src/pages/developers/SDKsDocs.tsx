import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const sdks = [
  {
    name: "Node.js",
    description: "Official Node.js SDK for Clarus AP API",
    installCommand: "npm install @clarusap/node",
    example: `import ClarusAP from '@clarusap/node';

const clarus = new ClarusAP('sk_live_xxx');

// List invoices
const invoices = await clarus.invoices.list({
  status: 'approved',
  limit: 10
});

// Get a specific invoice
const invoice = await clarus.invoices.retrieve('inv_abc123');

// Approve an invoice
await clarus.invoices.approve('inv_abc123', {
  comment: 'Approved via API'
});`,
    version: "1.0.0",
    status: "Coming Soon",
  },
  {
    name: "Python",
    description: "Official Python SDK for Clarus AP API",
    installCommand: "pip install clarusap",
    example: `import clarusap

clarus = clarusap.Client(api_key='sk_live_xxx')

# List invoices
invoices = clarus.invoices.list(
    status='approved',
    limit=10
)

# Get a specific invoice
invoice = clarus.invoices.retrieve('inv_abc123')

# Approve an invoice
clarus.invoices.approve('inv_abc123', 
    comment='Approved via API'
)`,
    version: "1.0.0",
    status: "Coming Soon",
  },
  {
    name: "Go",
    description: "Official Go SDK for Clarus AP API",
    installCommand: "go get github.com/clarusap/clarusap-go",
    example: `import "github.com/clarusap/clarusap-go"

client := clarusap.NewClient("sk_live_xxx")

// List invoices
invoices, err := client.Invoices.List(&clarusap.InvoiceListParams{
    Status: "approved",
    Limit:  10,
})

// Get a specific invoice
invoice, err := client.Invoices.Retrieve("inv_abc123")

// Approve an invoice
_, err = client.Invoices.Approve("inv_abc123", &clarusap.ApproveParams{
    Comment: "Approved via API",
})`,
    version: "1.0.0",
    status: "Coming Soon",
  },
];

export default function SDKsDocs() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/dashboard");
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
          Back to Dashboard
        </Button>

        <div className="space-y-4">
          <Badge variant="secondary">Resources</Badge>
          <h1 className="text-4xl font-bold tracking-tight">SDKs & Libraries</h1>
          <p className="text-xl text-muted-foreground">
            Official client libraries for integrating with the Clarus AP API.
          </p>
        </div>

        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Our official SDKs are currently in development. In the meantime, you can use the REST API 
              directly with any HTTP client. Check out our{" "}
              <a href="/developers/authentication" className="text-primary hover:underline">
                authentication guide
              </a>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>

        {sdks.map((sdk) => (
          <Card key={sdk.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{sdk.name}</CardTitle>
                  <CardDescription>{sdk.description}</CardDescription>
                </div>
                <Badge variant="secondary">{sdk.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Installation</p>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                  {sdk.installCommand}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Quick Example</p>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  <pre className="text-muted-foreground">{sdk.example}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Community Libraries</CardTitle>
            <CardDescription>
              Third-party libraries built by the community (not officially supported)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No community libraries available yet. If you've built a library for Clarus AP, 
              let us know at{" "}
              <a href="mailto:developers@clarusap.com" className="text-primary hover:underline">
                developers@clarusap.com
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OpenAPI Specification</CardTitle>
            <CardDescription>
              Generate your own client library using our OpenAPI spec
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Download our OpenAPI 3.0 specification to generate client libraries in any language 
              using tools like openapi-generator.
            </p>
            <Button variant="outline" disabled>
              <ExternalLink className="h-4 w-4 mr-2" />
              Download OpenAPI Spec (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </DeveloperLayout>
  );
}
