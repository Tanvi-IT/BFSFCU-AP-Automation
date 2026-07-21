import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VendorRiskBadgeProps {
  riskScore: number | null | undefined;
  className?: string;
  showLabel?: boolean;
}

export function VendorRiskBadge({ riskScore, className, showLabel = true }: VendorRiskBadgeProps) {
  const score = riskScore ?? 0;

  if (score >= 70) {
    return (
      <Badge 
        variant="destructive" 
        className={cn("flex items-center gap-1", className)}
      >
        <ShieldAlert className="h-3 w-3" />
        {showLabel && <span>High Risk</span>}
        {!showLabel && <span>{score}</span>}
      </Badge>
    );
  }

  if (score >= 40) {
    return (
      <Badge 
        variant="outline" 
        className={cn("flex items-center gap-1 border-warning text-warning", className)}
      >
        <AlertTriangle className="h-3 w-3" />
        {showLabel && <span>Medium Risk</span>}
        {!showLabel && <span>{score}</span>}
      </Badge>
    );
  }

  if (score > 0) {
    return (
      <Badge 
        variant="outline" 
        className={cn("flex items-center gap-1 border-muted-foreground", className)}
      >
        <Shield className="h-3 w-3" />
        {showLabel && <span>Low Risk</span>}
        {!showLabel && <span>{score}</span>}
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn("flex items-center gap-1 border-success text-success", className)}
    >
      <ShieldCheck className="h-3 w-3" />
      {showLabel && <span>No Risk</span>}
    </Badge>
  );
}
