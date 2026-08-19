import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

/** Upload an image from the rich-text editor (paste/drop/insert). Returns a URL. */
export async function POST(req: NextRequest) {
  try {
    await requireRole(["team_member"]);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 25 MB" }, { status: 400 });
  }

  // Images (editor) keep their own folder; everything else (to-do attachments) too.
  const subdir = file.type.startsWith("image/") ? "editor-images" : "todo-files";
  const stored = await saveUpload(file, subdir);
  return NextResponse.json({ url: `/api/files/${stored.storedPath}`, name: file.name });
}
