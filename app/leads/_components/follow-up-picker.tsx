"use client";

import { DateTimeField } from "./date-time-field";

/**
 * The follow-up reminder's date and time. A thin wrapper over DateTimeField so
 * the reminder and the journey's date fields behave identically.
 */
export function FollowUpPicker({
  defaultValue,
}: {
  /** Existing reminder as yyyy-mm-ddThh:mm, or "" when unset. */
  defaultValue: string;
}) {
  return (
    <DateTimeField
      name="followUpAt"
      defaultValue={defaultValue}
      allDayHint="No time — reminds you any time that day."
    />
  );
}
