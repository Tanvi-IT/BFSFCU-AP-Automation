/**
 * A quick preset date filter for the historical queues (Approved, Declined,
 * Audit). Replaces the two open-ended date inputs with a single dropdown of
 * common windows, which is what reviewers actually reach for.
 *
 * Each preset resolves to the same inclusive `{ from, to }` `YYYY-MM-DD` range
 * the API already understands (see DateRangeFilter / invoicesApi.list), so
 * nothing downstream has to change: "All time" is simply an empty range.
 */

import { CalendarDays } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type DateRange, EMPTY_DATE_RANGE } from "@/components/DateRangeFilter";

export type DatePreset = "7d" | "1m" | "6m" | "1y" | "all";

/** Default window: show everything, so nothing is hidden until a user narrows. */
export const DEFAULT_DATE_PRESET: DatePreset = "all";

const PRESET_LABELS: Record<DatePreset, string> = {
  "7d": "Last 7 days",
  "1m": "Last month",
  "6m": "Last 6 months",
  "1y": "Last year",
  all: "All time",
};

// Display order in the dropdown.
const PRESET_ORDER: DatePreset[] = ["7d", "1m", "6m", "1y", "all"];

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolve a preset to the inclusive from/to range the API expects. */
export function presetToRange(preset: DatePreset): DateRange {
  if (preset === "all") return EMPTY_DATE_RANGE;
  const to = new Date();
  const from = new Date();
  switch (preset) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "1m":
      from.setMonth(from.getMonth() - 1);
      break;
    case "6m":
      from.setMonth(from.getMonth() - 6);
      break;
    case "1y":
      from.setFullYear(from.getFullYear() - 1);
      break;
  }
  return { from: toYmd(from), to: toYmd(to) };
}

interface DateRangePresetFilterProps {
  value: DatePreset;
  onChange: (next: DatePreset) => void;
  /** What the range filters on, e.g. "Approved". Shown as the field hint. */
  label?: string;
}

export function DateRangePresetFilter({
  value,
  onChange,
  label,
}: DateRangePresetFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      {label && (
        <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      )}
      <Select value={value} onValueChange={(v) => onChange(v as DatePreset)}>
        <SelectTrigger className="w-44" aria-label={label ? `${label} range` : "Date range"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map((p) => (
            <SelectItem key={p} value={p}>
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
