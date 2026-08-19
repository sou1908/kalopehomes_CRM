"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials, colorFromName } from "@/lib/avatar";
import type { LeadMention } from "@/lib/leads-shared";
import type { ChatFormState } from "../actions";
import { LeadMentionPicker } from "./lead-mention-picker";

export type ChatMsg = {
  id: string;
  userId: string | null;
  authorName: string;
  body: string;
  createdAt: number;
};

type ChatAction = (
  prev: ChatFormState,
  formData: FormData,
) => Promise<ChatFormState>;

const REFRESH_MS = 5000;

// Canonical inline reference to a lead, e.g. [[lead:abc123]]. Inserted by the
// picker (never typed by hand) and rendered as a clickable chip.
const LEAD_TOKEN = /\[\[lead:([A-Za-z0-9_-]+)\]\]/g;

function LeadChip({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={`/leads/${id}`}
      className="mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-accent/15 px-1.5 py-0.5 align-baseline text-[13px] font-medium text-accentInk hover:bg-accent/25"
    >
      <span className="text-[11px]">＃</span>
      {name}
    </Link>
  );
}

/** Render a message body, turning [[lead:ID]] tokens into chips. */
function renderBody(body: string, names: Map<string, string>) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LEAD_TOKEN.lastIndex = 0;
  let i = 0;
  while ((m = LEAD_TOKEN.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    const id = m[1];
    out.push(<LeadChip key={`c${i++}`} id={id} name={names.get(id) ?? "lead"} />);
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

/**
 * A live-ish chat thread used by both the team room and 1:1 DMs. The `action`
 * (a server action) decides where messages go; pass `recipientId` for a DM so
 * it's submitted with the message.
 */
export function ChatThread({
  messages,
  meId,
  action,
  recipientId,
  leads = [],
  placeholder = "Message the team…",
}: {
  messages: ChatMsg[];
  meId: string;
  action: ChatAction;
  recipientId?: string;
  leads?: LeadMention[];
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [tagged, setTagged] = useState<LeadMention[]>([]);

  // id → name, for resolving [[lead:ID]] chips in rendered messages.
  const leadNames = useMemo(
    () => new Map(leads.map((l) => [l.id, l.name])),
    [leads],
  );

  useEffect(() => setMounted(true), []);

  // Pull new messages on a light interval (no websockets).
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // Clear the box + tagged leads + refocus after a successful send.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setTagged([]);
      inputRef.current?.focus();
    }
  }, [state?.ok]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">
            No messages yet — say hello. 👋
          </div>
        )}
        {messages.map((m) => {
          const mine = m.userId === meId;
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: colorFromName(m.userId ?? m.authorName) }}
              >
                {initials(m.authorName)}
              </span>
              <div className={`flex max-w-[78%] flex-col ${mine ? "items-end text-right" : ""}`}>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="font-medium text-text">{mine ? "You" : m.authorName}</span>
                  <span suppressHydrationWarning>
                    {mounted
                      ? new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
                <div
                  className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-tr-sm bg-accent/20 text-text"
                      : "rounded-tl-sm bg-panel text-text"
                  }`}
                >
                  {renderBody(m.body, leadNames)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form ref={formRef} action={formAction} className="mt-2 border-t border-border pt-3">
        {recipientId && <input type="hidden" name="recipientId" value={recipientId} />}
        {tagged.map((l) => (
          <input key={l.id} type="hidden" name="leadRefs" value={l.id} />
        ))}

        {tagged.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {tagged.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-[13px] font-medium text-accentInk"
              >
                <span className="text-[11px]">＃</span>
                {l.name}
                <button
                  type="button"
                  onClick={() => setTagged((t) => t.filter((x) => x.id !== l.id))}
                  className="ml-0.5 text-accentInk/70 hover:text-accentInk"
                  aria-label={`Remove ${l.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            name="body"
            rows={1}
            placeholder={placeholder}
            className="input max-h-32 min-h-[40px] flex-1 resize-y text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            {pending ? "…" : "Send"}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <LeadMentionPicker
            leads={leads}
            excludeIds={tagged.map((l) => l.id)}
            onPick={(l) => setTagged((t) => [...t, l])}
          />
          <p className="text-[11px] text-muted">Enter to send · Shift+Enter = new line</p>
        </div>
        {state?.error && <div className="mt-1 text-xs text-danger">{state.error}</div>}
      </form>
    </div>
  );
}
