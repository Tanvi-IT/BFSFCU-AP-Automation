import { Check } from "lucide-react";

/**
 * A subtle one-line hint shown under an ACH Routing/Account field on the review
 * pages. It compares the value on the invoice (extracted, or being edited)
 * against the matched/linked vendor's value on record and lets a reviewer pull
 * the record value in with one click.
 *
 * Rendered only when the vendor has a value on record. When they match it
 * reassures ("Same as vendor record"); when they differ (or the invoice field
 * is blank) it surfaces the record value and — in edit mode — an Override/Use
 * link that replaces the field. Auto-fill of a *blank* field happens on the
 * page; this component never mutates on its own.
 */

/** Compare loosely: ACH numbers vary only by incidental spaces/dashes. */
const norm = (s: string | null | undefined) => (s ?? "").replace(/[\s-]/g, "").trim();

interface AchRecordHintProps {
  /** Value currently on the field — the invoice's value, or the edited value. */
  value: string | null | undefined;
  /** The matched/linked vendor's value on record. */
  record: string | null | undefined;
  /** Edit mode only: replaces the field with the record value when clicked. */
  onUseRecord?: (record: string) => void;
}

export function AchRecordHint({ value, record, onUseRecord }: AchRecordHintProps) {
  const rec = (record ?? "").trim();
  if (!rec) return null; // nothing on record to compare against

  const current = norm(value);

  if (current !== "" && current === norm(rec)) {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="h-3 w-3 text-emerald-500" />
        Same as vendor record
      </p>
    );
  }

  const blank = current === "";
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {blank ? "Vendor record:" : "Differs from vendor record:"}{" "}
      <span className="font-mono text-foreground/80">{rec}</span>
      {onUseRecord && (
        <button
          type="button"
          onClick={() => onUseRecord(rec)}
          className="ml-1.5 font-medium text-primary hover:underline"
        >
          {blank ? "Use" : "Override"}
        </button>
      )}
    </p>
  );
}
