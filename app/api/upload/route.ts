import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { LEAD_SURFACE_ROLES } from "@/lib/roles";
import { saveUpload } from "@/lib/storage";

/** Upload an image from the rich-text editor (paste/drop/insert). Returns a URL. */
export async function POST(req: NextRequest) {
  try {
    await requireRole([...LEAD_SURFACE_ROLES]);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  // Only these. Both the extension and the mime are attacker-controlled, so
  // neither is trusted alone — an ".svg" renders inline and executes scripts on
  // our own origin, which is a stored XSS with the user's session attached.
  const ALLOWED: Record<string, string[]> = {
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".png": ["image/png"],
    ".webp": ["image/webp"],
    ".gif": ["image/gif"],
    ".mp4": ["video/mp4"],
    ".webm": ["video/webm"],
    ".pdf": ["application/pdf"],
  };
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes || !allowedMimes.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          "That file type isn't allowed. Use a photo (jpg, png, webp, gif), a video (mp4, webm) or a PDF.",
      },
      { status: 400 },
    );
  }

  // Video needs far more room than a pasted screenshot: a phone walkthrough of
  // a kitchen runs well past 25 MB, and refusing it would push agents back to
  // WhatsApp, where the CRM never sees it.
  const isVideo = file.type.startsWith("video/");
  const limitMb = isVideo ? 200 : 25;
  if (file.size > limitMb * 1024 * 1024) {
    return NextResponse.json(
      { error: `File must be under ${limitMb} MB` },
      { status: 400 },
    );
  }

  // Site captures get their own folder — they're evidence, and worth being able
  // to find and back up separately from pasted editor images.
  const subdir =
    form.get("purpose") === "site"
      ? "site-visits"
      : file.type.startsWith("image/")
        ? "editor-images"
        : "todo-files";
  const stored = await saveUpload(file, subdir);
  return NextResponse.json({
    url: `/api/files/${stored.storedPath}`,
    name: file.name,
    kind: stored.mimeType.startsWith("video/")
      ? "video"
      : stored.mimeType.startsWith("image/")
        ? "image"
        : "file",
  });
}
