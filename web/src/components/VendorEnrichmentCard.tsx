import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Globe, Building2, MapPin, AlertTriangle, Copy } from "lucide-react";
import { VendorRiskBadge } from "./VendorRiskBadge";

interface VendorEnrichment {
  id: string;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  duplicate_risk: number | null;
  fraud_risk: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface VendorEnrichmentCardProps {
  enrichment: VendorEnrichment | null;
  vendorRiskScore: number | null;
  isLoading?: boolean;
  onEnrich?: () => void;
  canEnrich?: boolean;
}

export function VendorEnrichmentCard({
  enrichment,
  vendorRiskScore,
  isLoading,
  onEnrich,
  canEnrich = false,
}: VendorEnrichmentCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Vendor Enrichment
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!enrichment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Vendor Enrichment
          </CardTitle>
          <CardDescription>
            Enrich vendor data with AI-powered intelligence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">
              No enrichment data available for this vendor.
            </p>
            {canEnrich && onEnrich && (
              <Button onClick={onEnrich} disabled={isLoading}>
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich Vendor
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Vendor Enrichment
          </CardTitle>
          <VendorRiskBadge riskScore={vendorRiskScore} />
        </div>
        <CardDescription>
          Last updated: {new Date(enrichment.updated_at).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enrichment.legal_name && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Legal Name</p>
                <p className="text-sm font-medium">{enrichment.legal_name}</p>
              </div>
            </div>
          )}

          {enrichment.website && (
            <div className="flex items-start gap-2">
              <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={enrichment.website.startsWith('http') ? enrichment.website : `https://${enrichment.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {enrichment.domain || enrichment.website}
                </a>
              </div>
            </div>
          )}

          {enrichment.industry && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Industry</p>
                <Badge variant="secondary">{enrichment.industry}</Badge>
              </div>
            </div>
          )}

          {enrichment.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="text-sm">{enrichment.address}</p>
              </div>
            </div>
          )}
        </div>

        {/* Risk Indicators */}
        <div className="pt-4 border-t space-y-3">
          <h4 className="text-sm font-medium">Risk Indicators</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Fraud Risk
              </span>
              <span className="text-sm font-medium">{enrichment.fraud_risk ?? 0}%</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Copy className="h-3 w-3" />
                Duplicate Risk
              </span>
              <span className="text-sm font-medium">{enrichment.duplicate_risk ?? 0}%</span>
            </div>
          </div>
        </div>

        {enrichment.notes && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">AI Notes</h4>
            <p className="text-sm text-muted-foreground">{enrichment.notes}</p>
          </div>
        )}

        {canEnrich && onEnrich && (
          <div className="pt-4">
            <Button variant="outline" size="sm" onClick={onEnrich} disabled={isLoading}>
              <Sparkles className="h-4 w-4 mr-2" />
              Re-enrich Vendor
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
