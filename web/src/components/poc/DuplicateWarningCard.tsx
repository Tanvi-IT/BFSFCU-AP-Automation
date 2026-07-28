import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, FileWarning, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { DuplicateType } from "./DuplicateBadge";

interface DuplicateWarningCardProps {
  duplicateType: DuplicateType;
  duplicateOfId: string | null;
  duplicateOfNumber?: string;
  duplicateOfStatus?: string | null;
  isAdmin?: boolean;
  isChecker?: boolean;
  isMaker?: boolean;
  onReviewDuplicate?: () => void;
  onSendToAdmin?: () => void;
  onResolveDuplicate?: () => void;
  onDeclineAsDuplicate?: () => void;
}

export function DuplicateWarningCard({
  duplicateType,
  duplicateOfId,
  duplicateOfNumber,
  duplicateOfStatus,
  isAdmin,
  isChecker,
  isMaker,
  onReviewDuplicate,
  onSendToAdmin,
  onResolveDuplicate,
  onDeclineAsDuplicate,
}: DuplicateWarningCardProps) {
  if (!duplicateType) return null;

  const config = {
    hard: {
      title: "HARD DUPLICATE",
      icon: AlertTriangle,
      iconColor: "text-destructive",
      bgColor: "bg-destructive/10 border-destructive/50",
      description: "This invoice matches an existing invoice for this vendor.",
      action: "Admin must resolve before approval.",
    },
    soft: {
      title: "POSSIBLE DUPLICATE",
      icon: Copy,
      iconColor: "text-warning",
      bgColor: "bg-warning/10 border-warning/50",
      description: "Similar invoice detected. Same vendor, amount, and date range.",
      action: "Please review carefully before proceeding.",
    },
    possible_duplicate: {
      title: "POSSIBLE DUPLICATE — REISSUED",
      icon: Copy,
      iconColor: "text-warning",
      bgColor: "bg-warning/10 border-warning/50",
      description: "This invoice may be a reissued version of an existing invoice for this vendor.",
      action: "Review carefully. The original invoice has been moved to Exceptions.",
    },
    file: {
      title: "DUPLICATE FILE",
      icon: FileWarning,
      iconColor: "text-muted-foreground",
      bgColor: "bg-muted border-muted-foreground/50",
      description: "This file matches another previously submitted invoice.",
      action: "Admin can override if needed.",
    },
  };

  const { title, icon: Icon, iconColor, bgColor, description, action } = config[duplicateType];

  return (
    <Card className={bgColor}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {duplicateOfId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Original invoice:</span>
            <Link 
              to={duplicateOfStatus === "exception" ? `/exceptions/${duplicateOfId}` : duplicateOfStatus === "validated" ? `/low-confidence/${duplicateOfId}` : `/exceptions/${duplicateOfId}`}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {duplicateOfNumber || duplicateOfId.slice(0, 8)}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
        
        <p className="text-sm font-medium">{action}</p>

        {/* Action buttons based on role */}
        <div className="flex gap-2 flex-wrap pt-2">
          {duplicateType === "hard" && (
            <>
              {isChecker && !isAdmin && onReviewDuplicate && (
                <Button variant="outline" size="sm" onClick={onReviewDuplicate}>
                  Review Duplicate
                </Button>
              )}
              {isMaker && !isChecker && !isAdmin && onSendToAdmin && (
                <Button variant="outline" size="sm" onClick={onSendToAdmin}>
                  Send to Admin
                </Button>
              )}
              {isAdmin && onResolveDuplicate && (
                <Button variant="default" size="sm" onClick={onResolveDuplicate}>
                  Resolve Duplicate
                </Button>
              )}
            </>
          )}
          {onDeclineAsDuplicate && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDeclineAsDuplicate}
              className="gap-1"
            >
              Decline as Duplicate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
