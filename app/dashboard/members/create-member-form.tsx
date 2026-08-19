"use client";

import { useActionState, useEffect, useRef } from "react";
import { createMemberAction } from "./actions";
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/roles-shared";

export function CreateMemberForm() {
  const [state, action, pending] = useActionState(createMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <form ref={formRef} action={action} className="card space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required className="input text-sm" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input text-sm" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Temporary password</label>
        <input
          id="password"
          name="password"
          type="text"
          required
          minLength={8}
          className="input font-mono text-sm"
          placeholder="At least 8 characters"
        />
        <p className="mt-1 text-[11px] text-muted">
          Share this with the member — they sign in with their email and this
          password.
        </p>
      </div>
      <div>
        <label className="label">Roles</label>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {ALL_ROLES.map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-panel px-3 py-2 text-xs hover:border-accent/50"
            >
              <input
                type="checkbox"
                name={`role_${r}`}
                className="mt-0.5 accent-accent"
                defaultChecked={r === "telecaller"}
              />
              <span>
                <span className="block font-medium text-text">{ROLE_LABELS[r]}</span>
                <span className="block text-[11px] text-muted">
                  {ROLE_DESCRIPTIONS[r]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {state?.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          Member account created.
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary text-sm">
        {pending ? "Creating…" : "Create member account"}
      </button>
    </form>
  );
}
