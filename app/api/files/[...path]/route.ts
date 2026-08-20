import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";
import { LEAD_SURFACE_ROLES } from "@/lib/roles";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

// SVG is deliberately absent: browsers render it inline and run scripts inside
// it, which would make an upload a stored XSS on our own origin.
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // Uploads are customer material — site photos, addresses, attachments. The
  // filenames are random, but a random name is obscurity, not access control:
  // URLs leak through history, referrers and forwarded links.
  try {
    await requireRole([...LEAD_SURFACE_ROLES]);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { path: parts } = await params;
  const rel = parts.join("/");
  const fullPath = path.resolve(UPLOAD_DIR, rel);

  // Guard against path traversal.
  if (!fullPath.startsWith(UPLOAD_DIR + path.sep) && fullPath !== UPLOAD_DIR) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(fullPath);
    // Infer mime from the file extension (uploads are to-do attachments).
    const mime =
      MIME_BY_EXT[path.extname(rel).toLowerCase()] ?? "application/octet-stream";
    // Images and video are shown in place; everything else downloads rather
    // than rendering, so an unexpected type can't execute in the page.
    const inline = mime.startsWith("image/") || mime.startsWith("video/");
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        // Without this a browser may sniff past the declared type and run it.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": inline ? "inline" : "attachment",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
