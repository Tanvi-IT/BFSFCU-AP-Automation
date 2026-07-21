import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, Info, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WebhooksDocs() {
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
          <Badge variant="secondary">Webhooks</Badge>
          <h1 className="text-4xl font-bold tracking-tight">Webhooks Overview</h1>
          <p className="text-xl text-muted-foreground">
            Receive real-time notifications when events occur in Clarus AP.
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How webhooks work</AlertTitle>
          <AlertDescription>
            Clarus AP sends HTTP POST requests to your configured endpoint URL whenever 
            subscribed events occur. Your endpoint must return a 2xx status code within 30 seconds.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Payload Structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              All webhook payloads follow a consistent structure:
            </p>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-muted-foreground">
{`{
  "id": "evt_abc123def456",
  "type": "invoice.approved",
  "created": "2024-01-20T15:30:00Z",
  "data": {
    "object": {
      "id": "inv_xyz789",
      "invoice_number": "INV-2024-001",
      "status": "approved",
      "total_amount": 1080.00,
      ...
    }
  },
  "tenant_id": "tnt_123456"
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Webhook Signatures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              All webhook requests include a signature header for verification. You should always 
              verify the signature before processing the webhook payload.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">Signature Header</p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                X-ClarusAP-Signature: t=1706023800,v1=abc123def456...
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Verification (Node.js)</p>
              <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
{`import crypto from 'crypto';

function verifySignature(payload, signature, secret) {
  const [tPart, v1Part] = signature.split(',');
  const timestamp = tPart.split('=')[1];
  const receivedSig = v1Part.split('=')[1];
  
  const signedPayload = \`\${timestamp}.\${payload}\`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(receivedSig),
    Buffer.from(expectedSig)
  );
}`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Retry Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              If your endpoint returns a non-2xx status or times out, Clarus AP will retry with 
              exponential backoff:
            </p>
            <div className="grid gap-2 text-sm">
              <div className="grid grid-cols-2 gap-4 p-2 bg-muted rounded">
                <span>Attempt 1</span>
                <span className="text-muted-foreground">Immediate</span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-2">
                <span>Attempt 2</span>
                <span className="text-muted-foreground">After 15 minutes</span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-2 bg-muted rounded">
                <span>Attempt 3</span>
                <span className="text-muted-foreground">After 1 hour</span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-2">
                <span>Attempt 4</span>
                <span className="text-muted-foreground">After 6 hours</span>
              </div>
              <div className="grid grid-cols-2 gap-4 p-2 bg-muted rounded">
                <span>Attempt 5</span>
                <span className="text-muted-foreground">After 24 hours</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              After 5 failed attempts, the webhook delivery is marked as failed. You can view 
              delivery logs in your dashboard.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best Practices</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Always verify webhook signatures before processing</li>
              <li>Return a 2xx response quickly, then process asynchronously</li>
              <li>Handle duplicate events idempotently using the event ID</li>
              <li>Use HTTPS endpoints in production</li>
              <li>Monitor your webhook delivery logs for failures</li>
              <li>Implement proper error handling and logging</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DeveloperLayout>
  );
}
