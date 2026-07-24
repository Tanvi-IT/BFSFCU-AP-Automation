/**
 * An inclusive from/to date range, for the historical queues.
 *
 * Both ends are optional — an open-ended range is a legitimate search ("every
 * invoice declined since March"). Values are `YYYY-MM-DD` strings, which is
 * what a native date input produces and what the API expects, so nothing has to
 * be parsed or timezone-shifted on the way through.
 */

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarDays, X } from "lucide-react";

export interface DateRange {
  from: string;
  to: string;
}

export const EMPTY_DATE_RANGE: DateRange = { from: "", to: "" };

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** What the range filters on, e.g. "Approved". Shown as the field hint. */
  label?: string;
}

export function DateRangeFilter({ value, onChange, label }: DateRangeFilterProps) {
  const hasValue = Boolean(value.from || value.to);

  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      {label && (
        <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      )}
      <Input
        type="date"
        aria-label={label ? `${label} from` : "From date"}
        value={value.from}
        // Bound each input by the other so an impossible range cannot be picked.
        max={value.to || undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="w-40"
      />
      <span className="shrink-0 text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label={label ? `${label} to` : "To date"}
        value={value.to}
        min={value.from || undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="w-40"
      />
      {hasValue && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear date range"
          onClick={() => onChange(EMPTY_DATE_RANGE)}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
