import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface VariationBadgeProps {
  variationScore?: number | null;
  isCritical?: boolean;
  autoRouted?: boolean;
  variationFlags?: string[] | null;
  anomalyCount?: number | null;
  anomalies?: unknown[] | null;
  className?: string;
}

export const VariationBadge = ({ 
  variationFlags = null,
  anomalyCount = 0,
  anomalies = null,
  className 
}: VariationBadgeProps) => {
  const flagsCount = Array.isArray(variationFlags) ? variationFlags.length : 0;
  const anomaliesCount = Array.isArray(anomalies) ? anomalies.length : 0;
  const hasFlags = flagsCount > 0 || (anomalyCount ?? 0) > 0 || anomaliesCount > 0;

  if (hasFlags) {
    return (
      <Badge 
        className={cn(
          "bg-orange-500 text-white hover:bg-orange-600 flex items-center gap-1",
          className
        )}
      >
        <AlertTriangle className="h-3 w-3" />
        Flagged
      </Badge>
    );
  }
  
  return (
    <Badge 
      className={cn(
        "bg-green-500 text-white hover:bg-green-600 flex items-center gap-1",
        className
      )}
    >
      <CheckCircle2 className="h-3 w-3" />
      Clean
    </Badge>
  );
};

interface VariationFlagBadgeProps {
  flag: string;
  className?: string;
}

const flagConfig: Record<string, { label: string; severity: 'critical' | 'warning' | 'info' }> = {
  price_spike: { label: 'Price Spike', severity: 'warning' },
  billing_spike: { label: 'Volume Spike', severity: 'warning' },
  bank_change: { label: 'Bank Changed', severity: 'critical' },
  new_gl_code: { label: 'New GL Code', severity: 'info' },
  duplicate_invoice: { label: 'Duplicate', severity: 'critical' },
  tax_mismatch: { label: 'Tax ID Mismatch', severity: 'critical' },
  currency_change: { label: 'Currency Change', severity: 'warning' },
  line_item_outlier: { label: 'Line Item Outlier', severity: 'info' },
};

export const VariationFlagBadge = ({ flag, className }: VariationFlagBadgeProps) => {
  const config = flagConfig[flag] || { label: flag, severity: 'info' };
  
  const severityStyles = {
    critical: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    warning: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    info: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  };
  
  return (
    <Badge 
      variant="outline"
      className={cn(severityStyles[config.severity], className)}
    >
      {config.label}
    </Badge>
  );
};
