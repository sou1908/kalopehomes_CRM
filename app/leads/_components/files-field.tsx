"use client";

import { useRef, useState } from "react";
import { parseJourneyFiles, type JourneyFile } from "@/lib/leads-shared";
import { Icon } from "@/app/_components/icons";

/**
 * Photos and video captured on a site visit.
 *
 * Uploads as each file is chosen rather than on submit: an agent standing in
 * someone's kitchen on patchy signal should see each photo land, not lose ten
 * of them to one failed form post. The field holds only the resulting URLs, so
 * the form itself stays small.
 *
 * Submits `name` as a JSON array of { url, name, kind }.
 */
export function FilesField({
  name,
  defaultValue,
}: {
  name: string;
  /** Existing value as the stored JSON string. */
  defaultValue: string;
}) {
  const [files, setFiles] = useState<JourneyFile[]>(() =>
    parseJourneyFiles(defaultValue),
  );
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList) => {
    setError(null);
    for (const file of Array.from(list)) {
      setBusy((n) => n + 1);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("purpose", "site");
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `Couldn't upload ${file.name}.`);
        } else {
          setFiles((f) => [...f, { url: json.url, name: json.name, kind: json.kind }]);
        }
      } catch {
        setError(`Couldn't upload ${file.name}. Check your connection.`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(files)} />

      {files.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f, i) => (
            <li
              key={f.url}
              className="group relative overflow-hidden rounded-md border border-border bg-panel"
            >
              <a href={f.url} target="_blank" rel="noreferrer" title={f.name}>
                {f.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.url}
                    alt={f.name}
                    className="h-20 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-20 w-full flex-col items-center justify-center gap-1 text-muted">
                    <Icon name={f.kind === "video" ? "board" : "list"} size={18} />
                    <span className="px-1 text-center text-[9px] leading-tight">
                      {f.kind === "video" ? "Video" : "File"}
                    </span>
                  </span>
                )}
              </a>
              <button
                type="button"
                onClick={() => setFiles((fs) => fs.filter((_, x) => x !== i))}
                aria-label={`Remove ${f.name}`}
                title="Remove"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        onChange={(e) => e.target.files && upload(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy > 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-text disabled:opacity-50"
      >
        <Icon name="upload" size={13} />
        {busy > 0
          ? `Uploading ${busy}…`
          : files.length > 0
            ? "Add more"
            : "Add photos or video"}
      </button>

      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
