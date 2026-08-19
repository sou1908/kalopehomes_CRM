"use client";

import { useRef } from "react";
import { updatePresenceAction } from "../actions";
import {
  PRESENCE_ORDER,
  PRESENCE_META,
  presenceMeta,
  type Presence,
} from "@/lib/presence-shared";

export function PresenceDot({ value }: { value: Presence | string }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: presenceMeta(value).color }}
      aria-hidden
    />
  );
}

/**
 * A self-submitting availability picker. `userId` is the account whose status is
 * changed — your own from the sidebar, or any member's from the admin roster.
 */
export function PresenceSelect({
  userId,
  value,
}: {
  userId: string;
  value: Presence;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={updatePresenceAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <PresenceDot value={value} />
      <select
        name="presence"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border bg-panel px-1.5 py-0.5 text-xs text-text focus:border-accent/60 focus:outline-none"
      >
        {PRESENCE_ORDER.map((p) => (
          <option key={p} value={p}>
            {PRESENCE_META[p].label}
          </option>
        ))}
      </select>
    </form>
  );
}
