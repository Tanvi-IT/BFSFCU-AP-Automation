import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Server, FileCheck, Globe, Key, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const securityFeatures = [
  {
    icon: Shield,
    title: "SOC 2 Type II",
    description: "Clarus AP is SOC 2 Type II compliant, with annual audits conducted by independent third-party auditors.",
    status: "In Progress",
  },
  {
    icon: Lock,
    title: "Encryption",
    description: "All data is encrypted at rest using AES-256 and in transit using TLS 1.3.",
    status: "Active",
  },
  {
    icon: Server,
    title: "US Data Residency",
    description: "All data is stored exclusively in US-based data centers (US-East and US-West regions).",
    status: "Active",
  },
  {
    icon: FileCheck,
    title: "Audit Logging",
    description: "Comprehensive, immutable audit logs track all user actions and system events.",
    status: "Active",
  },
  {
    icon: Globe,
    title: "Network Security",
    description: "Enterprise-grade DDoS protection, WAF, and network isolation.",
    status: "Active",
  },
  {
    icon: Key,
    title: "API Security",
    description: "Rate limiting, API key rotation, and OAuth 2.0 support.",
    status: "Active",
  },
];

export default function SecurityDocs() {
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
          <Badge variant="secondary">Security</Badge>
          <h1 className="text-4xl font-bold tracking-tight">Security & Compliance</h1>
          <p className="text-xl text-muted-foreground">
            Learn about our security practices, compliance certifications, and data protection measures.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {securityFeatures.map((feature) => (
            <Card key={feature.title}>
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <Badge variant={feature.status === "Active" ? "default" : "secondary"}>
                      {feature.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Key Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Clarus AP implements industry best practices for API key management:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>API keys are hashed using bcrypt before storage — we never store plaintext keys</li>
              <li>Keys are displayed only once at creation time</li>
              <li>Key rotation is supported without service interruption</li>
              <li>Keys can be revoked immediately if compromised</li>
              <li>All API requests are logged with the key prefix for auditing</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Signature Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              All webhook payloads are signed using HMAC-SHA256:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Each webhook endpoint has a unique signing secret</li>
              <li>Signatures include a timestamp to prevent replay attacks</li>
              <li>Secrets can be rotated with a grace period for migration</li>
              <li>Failed signature verifications should be logged and investigated</li>
            </ul>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <p className="text-muted-foreground">Header format:</p>
              <code>X-ClarusAP-Signature: t=1706023800,v1=abc123...</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Protection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Encryption at Rest</h4>
              <p className="text-sm text-muted-foreground">
                All data is encrypted at rest using AES-256 encryption. Database backups are also 
                encrypted and stored in geographically separate locations.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Encryption in Transit</h4>
              <p className="text-sm text-muted-foreground">
                All API communications use TLS 1.3. We enforce HTTPS for all endpoints and do not 
                support unencrypted connections.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Data Isolation</h4>
              <p className="text-sm text-muted-foreground">
                Multi-tenant data isolation is enforced at the database level using Row Level 
                Security (RLS) policies. Each tenant's data is logically isolated.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Infrastructure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Hosted on enterprise-grade cloud infrastructure</li>
              <li>US-only data residency (no cross-border data routing)</li>
              <li>Automated daily backups with 30-day retention</li>
              <li>99.9% uptime SLA for enterprise customers</li>
              <li>24/7 infrastructure monitoring and alerting</li>
              <li>Incident response team with 1-hour response time for critical issues</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              The following compliance documents are available upon request for enterprise customers:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>SOC 2 Type II Report (under NDA)</li>
              <li>Data Processing Agreement (DPA)</li>
              <li>Security Questionnaire Responses</li>
              <li>Penetration Test Summary</li>
              <li>Business Continuity Plan Overview</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-4">
              Contact <a href="mailto:security@clarusap.com" className="text-primary hover:underline">security@clarusap.com</a> to 
              request compliance documentation.
            </p>
          </CardContent>
        </Card>
      </div>
    </DeveloperLayout>
  );
}
