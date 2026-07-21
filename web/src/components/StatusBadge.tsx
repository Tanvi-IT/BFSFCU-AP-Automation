import { Badge } from "@/components/ui/badge";
import { InvoiceStatus, RiskLevel } from "@/types/invoice";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: InvoiceStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
const statusConfig: Record<InvoiceStatus, { label: string; variant: string }> = {
    draft: { label: "Draft", variant: "bg-status-draft text-white" },
    ingested: { label: "Ingested", variant: "bg-status-ingested text-white" },
    submitted: { label: "Submitted", variant: "bg-status-submitted text-white" },
    validated: { label: "Validated", variant: "bg-status-validated text-white" },
    exception: { label: "Exception", variant: "bg-status-exception text-white" },
    approved: { label: "Approved", variant: "bg-status-approved text-white" },
    rejected: { label: "Rejected", variant: "bg-status-rejected text-white" },
    exported: { label: "Exported", variant: "bg-status-exported text-white" },
  };

  const config = statusConfig[status];

  return (
    <Badge className={cn(config.variant, "font-medium", className)}>
      {config.label}
    </Badge>
  );
};

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

export const RiskBadge = ({ level, className }: RiskBadgeProps) => {
  const riskConfig: Record<RiskLevel, { label: string; variant: string }> = {
    low: { label: "Low Risk", variant: "bg-risk-low text-white" },
    medium: { label: "Medium Risk", variant: "bg-risk-medium text-white" },
    high: { label: "High Risk", variant: "bg-risk-high text-white" },
  };

  const config = riskConfig[level];

  return (
    <Badge className={cn(config.variant, "font-medium", className)}>
      {config.label}
    </Badge>
  );
};
