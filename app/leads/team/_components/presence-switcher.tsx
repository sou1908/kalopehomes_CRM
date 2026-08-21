"use client";

import { useEffect, useRef, useState } from "react";
import { updatePresenceAction } from "../actions";
import {
  PRESENCE_ORDER,
  PRESENCE_META,
  presenceMeta,
  type Presence,
} from "@/lib/presence-shared";

/**
 * The status mark.
 *
 * Offline is a crossed-out ring rather than another filled dot, the way chat
 * apps draw it. Four solid dots differing only in colour puts the whole
 * distinction on colour alone — unreadable to anyone colour-blind, and easy to
 * misread as "quiet" when it actually means nobody is there. Shape carries it
 * instead, and colour reinforces.
 *
 * Always the same 12×12 box so a column of these lines up whatever the state.
 */
export function PresenceDot({
  value,
  size = 9,
}: {
  value: Presence | string;
  size?: number;
}) {
  const { color, label } = presenceMeta(value);
  const isOffline = (value ?? "offline") === "offline";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      className="shrink-0"
      role="img"
      aria-label={label}
    >
      {isOffline ? (
        <>
          <circle cx="6" cy="6" r="4.75" fill="none" stroke={color} strokeWidth="1.5" />
          <path
            d="M4.1 4.1 7.9 7.9M7.9 4.1 4.1 7.9"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <circle cx="6" cy="6" r="5" fill={color} />
      )}
    </svg>
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

  /**
   * Controlled, and the single source both the mark and the label read.
   *
   * `defaultValue` only applies on mount, so an uncontrolled select kept
   * showing whatever it rendered with while the dot beside it re-rendered from
   * the prop — pick Available and you got a green dot next to the word
   * "Offline". Two controls for one value that could disagree.
   *
   * Updating on change also means the menu reflects the choice immediately,
   * rather than after the server action returns.
   */
  const [current, setCurrent] = useState<Presence>(value);

  // Adopt what the server confirmed — covers a failed update, and an admin
  // changing this account's status from the roster.
  useEffect(() => setCurrent(value), [value]);

  return (
    <form ref={formRef} action={updatePresenceAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <PresenceDot value={current} />
      {/* The label takes its status's colour too. Colouring only the dot beside
          it left the word reading as plain body text, so the state you're in
          was carried by a 9px mark and nothing else. */}
      <select
        name="presence"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value as Presence);
          formRef.current?.requestSubmit();
        }}
        style={{ color: presenceMeta(current).color }}
        className="rounded-md border border-border bg-panel px-1.5 py-0.5 text-xs font-medium focus:border-accent/60 focus:outline-none"
      >
        {PRESENCE_ORDER.map((p) => (
          <option key={p} value={p} style={{ color: PRESENCE_META[p].color }}>
            {PRESENCE_META[p].label}
          </option>
        ))}
      </select>
    </form>
  );
}
