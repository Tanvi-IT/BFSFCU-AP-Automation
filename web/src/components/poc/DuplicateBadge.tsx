import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Copy, AlertTriangle, FileWarning } from "lucide-react";

export type DuplicateType = "hard" | "soft" | "file" | "possible_duplicate" | null;

interface DuplicateBadgeProps {
  type: DuplicateType;
  className?: string;
}

export function DuplicateBadge({ type, className }: DuplicateBadgeProps) {
  if (!type) return null;

  const config = {
    hard: {
      label: "Hard Duplicate",
      icon: AlertTriangle,
      className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    },
    soft: {
      label: "Possible Duplicate",
      icon: Copy,
      className: "bg-warning text-warning-foreground hover:bg-warning/90",
    },
    file: {
      label: "Duplicate File",
      icon: FileWarning,
      className: "bg-muted text-muted-foreground hover:bg-muted/90",
    },
    possible_duplicate: {
      label: "Possible Duplicate — Reissued",
      icon: Copy,
      className: "bg-warning text-warning-foreground hover:bg-warning/90",
    },
  };

  const { label, icon: Icon, className: badgeClass } = config[type];

  return (
    <Badge className={cn(badgeClass, className)}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}
