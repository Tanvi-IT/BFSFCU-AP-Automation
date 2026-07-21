import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VariationBadge, VariationFlagBadge } from "./VariationBadge";
import { AlertTriangle, TrendingUp, Zap, Info } from "lucide-react";

interface VariationDetailCardProps {
  variationScore?: number | null;
  variationFlags?: string[] | null;
  anomalyCount?: number | null;
  anomalies?: unknown[] | null;
  isCritical?: boolean;
  autoRouted?: boolean;
  baselineComparison?: {
    currentAmount: number;
    avgAmount?: number;
    percentDiff?: number;
  };
}

const flagExplanations: Record<string, string> = {
  price_spike: "Invoice total deviates more than 30% from vendor's historical average.",
  billing_spike: "Unusually high volume of invoices from this vendor in the past 7 days.",
  bank_change: "Bank account on invoice differs from the vendor's known bank account. This is a critical flag requiring manual verification.",
  new_gl_code: "GL codes on this invoice have not been seen in previous invoices from this vendor.",
  duplicate_invoice: "An invoice with this number already exists for this vendor. This requires manual review to avoid double payment.",
  tax_mismatch: "Tax ID on invoice does not match the vendor's registered tax ID. This is a critical compliance flag.",
  currency_change: "Invoice currency differs from vendor's usual billing currency.",
  line_item_outlier: "One or more line items have prices that deviate significantly from historical patterns.",
};

export const VariationDetailCard = ({
  variationScore = 0,
  variationFlags = [],
  anomalyCount = 0,
  anomalies = null,
  isCritical = false,
  autoRouted = false,
  baselineComparison,
}: VariationDetailCardProps) => {
  const score = variationScore || 0;
  const flags = variationFlags || [];

  // Determine routing reason
  const getRoutingReason = () => {
    if (isCritical) {
      return "This invoice was flagged with critical variations and requires mandatory manual approval.";
    }
    if (autoRouted) {
      return "This invoice passed all variation checks and was automatically routed for approval.";
    }
    if (flags.length > 0 || score >= 0.1) {
      return "This invoice has variations that require Maker review before submission to Checker.";
    }
    return "Standard processing workflow applies.";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Variation Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Status */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Variation Status</p>
            <VariationBadge 
              variationScore={score} 
              isCritical={isCritical} 
              autoRouted={autoRouted}
              variationFlags={flags}
              anomalyCount={anomalyCount}
              anomalies={anomalies}
              className="mt-1"
            />
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Score</p>
            <p className="text-2xl font-bold text-foreground">{(score * 100).toFixed(0)}%</p>
          </div>
        </div>

        {/* Routing Reason */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            {autoRouted ? (
              <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
            ) : (
              <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            )}
            <div>
              <p className="font-medium text-foreground">Routing Reason</p>
              <p className="text-sm text-muted-foreground mt-1">{getRoutingReason()}</p>
            </div>
          </div>
        </div>

        {/* Baseline Comparison */}
        {baselineComparison && baselineComparison.avgAmount && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Price Comparison</p>
                <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Current</p>
                    <p className="font-semibold text-foreground">
                      ${baselineComparison.currentAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Average</p>
                    <p className="font-semibold text-foreground">
                      ${baselineComparison.avgAmount.toLocaleString()}
                    </p>
                  </div>
                  {baselineComparison.percentDiff !== undefined && (
                    <div>
                      <p className="text-muted-foreground">Difference</p>
                      <p className={`font-semibold ${
                        Math.abs(baselineComparison.percentDiff) > 30 
                          ? 'text-red-500' 
                          : 'text-green-500'
                      }`}>
                        {baselineComparison.percentDiff > 0 ? '+' : ''}
                        {baselineComparison.percentDiff.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Variation Flags */}
        {flags.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Detected Variations</p>
            <div className="space-y-2">
              {flags.map((flag) => (
                <div 
                  key={flag}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between">
                    <VariationFlagBadge flag={flag} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {flagExplanations[flag] || 'Variation detected.'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {flags.length === 0 && !isCritical && (
          <div className="text-center py-4 text-muted-foreground">
            <p>No significant variations detected.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
