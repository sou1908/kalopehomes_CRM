"use client";

import { useState } from "react";

/**
 * A labeled dropdown that reveals a "please specify" text box when "Other" is
 * chosen. Submits a single hidden field (`name`): the picked option, or the
 * typed text when Other. Pre-existing custom values (not in `options`) open as
 * Other with the text filled in.
 */
export function SelectOrOther({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string | null;
}) {
  // Treat "Other" as a special trigger; strip it from the real options list.
  const opts = options.filter((o) => o.toLowerCase() !== "other");
  const initial = (defaultValue ?? "").trim();
  const known = initial !== "" && opts.includes(initial);
  const isOther = initial !== "" && !known;

  const [choice, setChoice] = useState(known ? initial : isOther ? "__other__" : "");
  const [other, setOther] = useState(isOther ? initial : "");

  const value = choice === "__other__" ? other : choice;
  const id = `sel-${name}`;

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={value} />
      <select
        id={id}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="input text-sm"
      >
        <option value="">— Select —</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {choice === "__other__" && (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Please specify…"
          autoFocus
          className="input mt-2 text-sm"
        />
      )}
    </div>
  );
}
