import { DeveloperLayout } from "@/components/developers/DeveloperLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Users, Package, RefreshCcw, Webhook, Shield, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const quickLinks = [
  {
    title: "Invoices API",
    description: "Create, retrieve, and manage invoices programmatically",
    href: "/developers/api/invoices",
    icon: FileText,
  },
  {
    title: "Vendors API",
    description: "Manage vendor records and verification status",
    href: "/developers/api/vendors",
    icon: Users,
  },
  {
    title: "Exports API",
    description: "Trigger and monitor ERP export operations",
    href: "/developers/api/exports",
    icon: Package,
  },
  {
    title: "ERP Sync API",
    description: "Synchronize master data with your ERP system",
    href: "/developers/api/erp-sync",
    icon: RefreshCcw,
  },
  {
    title: "Webhooks",
    description: "Receive real-time notifications for invoice events",
    href: "/developers/webhooks",
    icon: Webhook,
  },
  {
    title: "Security",
    description: "Learn about our security practices and compliance",
    href: "/developers/security",
    icon: Shield,
  },
];

export default function DeveloperHome() {
  const navigate = useNavigate();

  const handleBack = () => {
    // POC tenant always goes to POC dashboard
    navigate("/dashboard");
  };

  return (
    <DeveloperLayout>
      <div className="space-y-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Hero */}
        <div className="space-y-4">
          <Badge variant="secondary" className="mb-2">API v1</Badge>
          <h1 className="text-4xl font-bold tracking-tight">Clarus AP API Documentation</h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Build powerful AP automation integrations with the Clarus AP API. 
            Access invoices, vendors, exports, and real-time webhooks.
          </p>
        </div>

        {/* Quick Start */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">Quick Start</CardTitle>
            <CardDescription>Make your first API call in minutes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">1. Get your API key</p>
              <p className="text-sm text-muted-foreground">
                Navigate to Settings → API Keys in your Clarus AP dashboard to create an API key.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">2. Make a test request</p>
              <div className="bg-background rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-muted-foreground">
{`curl -X GET "https://api.clarusap.com/v1/invoices" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">3. Explore the API</p>
              <p className="text-sm text-muted-foreground">
                Browse our comprehensive API reference to discover all available endpoints.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Explore the API</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {quickLinks.map((link) => (
              <Link key={link.href} to={link.href}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <link.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{link.title}</CardTitle>
                      <CardDescription className="text-sm">{link.description}</CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Base URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              https://api.clarusap.com/v1
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              All API requests should be made to this base URL. HTTPS is required for all API calls.
            </p>
          </CardContent>
        </Card>

        {/* Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rate Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The Clarus AP API implements rate limiting to ensure fair usage:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Standard tier: 1,000 requests per minute</li>
              <li>Enterprise tier: 10,000 requests per minute</li>
              <li>Rate limit headers are included in all responses</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DeveloperLayout>
  );
}
