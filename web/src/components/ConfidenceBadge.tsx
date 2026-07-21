import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number; // Confidence score as percentage (0-100)
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBadge({ score, showLabel = true, className }: ConfidenceBadgeProps) {
  // Determine color based on score
  // Green: ≥ 85
  // Orange: 70–84
  // Red: < 70
  const getColorClass = () => {
    if (score >= 85) {
      return "bg-success text-success-foreground hover:bg-success/90";
    } else if (score >= 70) {
      return "bg-warning text-warning-foreground hover:bg-warning/90";
    } else {
      return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
    }
  };

  return (
    <Badge className={cn(getColorClass(), className)}>
      {score}%{showLabel && " Confidence"}
    </Badge>
  );
}

// Helper function to convert anomaly score to confidence percentage
export function anomalyToConfidence(anomalyScore: number | null): number {
  return Math.round((1 - (anomalyScore || 0)) * 100);
}
