import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, AlertTriangle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isPocTenant } from "@/lib/pocConfig";

export default function AuthenticationDocs() {
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
          <Badge variant="secondary">Authentication</Badge>
          <h1 className="text-4xl font-bold tracking-tight">Authentication</h1>
          <p className="text-xl text-muted-foreground">
            Learn how to authenticate your API requests to Clarus AP.
          </p>
        </div>

        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Secure your API keys</AlertTitle>
          <AlertDescription>
            Never expose your API keys in client-side code. Always make API calls from your server.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>API Key Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Clarus AP uses API keys to authenticate requests. You can create and manage your API keys 
              in the Settings → API Keys section of your dashboard.
            </p>
            <p className="text-muted-foreground">
              Include your API key in the <code className="bg-muted px-1 py-0.5 rounded">Authorization</code> header 
              of all requests:
            </p>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre>{`Authorization: Bearer sk_live_xxxxxxxxxxxxxx`}</pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Example Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">cURL</p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
{`curl -X GET "https://api.clarusap.com/v1/invoices" \\
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Node.js</p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
{`const response = await fetch('https://api.clarusap.com/v1/invoices', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer sk_live_xxxxxxxxxxxxxx',
    'Content-Type': 'application/json'
  }
});

const invoices = await response.json();`}
                </pre>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Python</p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
{`import requests

headers = {
    'Authorization': 'Bearer sk_live_xxxxxxxxxxxxxx',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://api.clarusap.com/v1/invoices',
    headers=headers
)

invoices = response.json()`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Key Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">sk_live_</Badge>
                <span className="font-medium">Production Keys</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Use production keys for live API requests. These keys have full access to your 
                production data.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">sk_test_</Badge>
                <span className="font-medium">Test Keys</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Use test keys for development and testing. These keys only access sandbox data.
              </p>
            </div>
          </CardContent>
        </Card>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Keep your API keys safe</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Never commit API keys to version control</li>
              <li>Use environment variables to store keys</li>
              <li>Rotate keys regularly and revoke compromised keys immediately</li>
              <li>Use different keys for development and production</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Error Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Authentication errors return a <code className="bg-muted px-1 py-0.5 rounded">401 Unauthorized</code> status:
            </p>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-muted-foreground">
{`{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key provided",
    "code": "invalid_api_key"
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </DeveloperLayout>
  );
}
