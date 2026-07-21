import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { vendorsApi } from "@/services";
import { VendorRiskBadge } from "./VendorRiskBadge";
import {
  ShieldAlert,
  TrendingUp,
  FileWarning,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface VendorRiskSnapshotProps {
  vendorId: string;
  vendorName?: string;
}

interface VendorRiskData {
  vendor_risk_score: number | null;
  fraud_probability: number | null;
  contract_risk_score: number | null;
}

interface VendorEnrichment {
  fraud_risk: number | null;
  notes: string | null;
  updated_at: string;
}

interface ContractExpiry {
  service_period: string | null;
}

interface RiskEvent {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  created_at: string;
}

export function VendorRiskSnapshot({ vendorId, vendorName }: VendorRiskSnapshotProps) {
  const [vendorRisk, setVendorRisk] = useState<VendorRiskData | null>(null);
  const [enrichment, setEnrichment] = useState<VendorEnrichment | null>(null);
  const [recentEvents, setRecentEvents] = useState<RiskEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchVendorRiskData();
  }, [vendorId]);

  const fetchVendorRiskData = async () => {
    try {
      // Fetch vendor risk scores
      // Risk/enrichment analytics is not ported to Azure yet.
      const vendorData = await vendorsApi.get(vendorId);
      const enrichmentData: any = null;
      const eventsData: any[] = [];


      setRecentEvents(eventsData || []);
    } catch (error) {
      console.error("Error fetching vendor risk data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-destructive/80 text-destructive-foreground";
      case "medium": return "bg-warning text-warning-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Vendor Risk Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const fraudProb = vendorRisk?.fraud_probability ?? enrichment?.fraud_risk ?? 0;
  const riskScore = vendorRisk?.vendor_risk_score ?? 0;
  const contractRisk = vendorRisk?.contract_risk_score ?? 0;

  return (
    <Card className="border-warning/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Vendor Risk Snapshot
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/vendors/${vendorId}`}>
              <ExternalLink className="h-4 w-4 mr-1" />
              View Profile
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk Scores Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Risk Score</p>
            <VendorRiskBadge riskScore={riskScore} showLabel={false} />
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Fraud Prob.</p>
            <span className={`text-lg font-bold ${
              fraudProb > 0.25 ? "text-destructive" : 
              fraudProb > 0.1 ? "text-warning" : "text-success"
            }`}>
              {(fraudProb * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Contract Risk</p>
            <Badge variant={
              contractRisk >= 70 ? "destructive" :
              contractRisk >= 40 ? "secondary" : "outline"
            }>
              {contractRisk}
            </Badge>
          </div>
        </div>

        {/* Risk Alert Banner */}
        {(fraudProb > 0.2 || riskScore >= 70) && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  Elevated Risk Detected
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This vendor shows {riskScore >= 70 ? "high risk indicators" : "elevated fraud probability"}. Review carefully before approval.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent Risk Events */}
        {recentEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Alerts
            </p>
            <div className="space-y-2">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30"
                >
                  <Badge className={`${getSeverityColor(event.severity)} text-xs shrink-0`}>
                    {event.severity}
                  </Badge>
                  <span className="text-muted-foreground flex-1 text-xs">
                    {event.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Notes */}
        {enrichment?.notes && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">AI Analysis</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {enrichment.notes}
            </p>
          </div>
        )}

        {/* Link to Risk Center */}
        <div className="pt-2">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to="/intelligence/vendor-risk">
              <TrendingUp className="h-4 w-4 mr-2" />
              View Vendor Risk Center
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}