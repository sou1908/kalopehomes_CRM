import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export type StoredFile = {
  storedPath: string; // relative path under UPLOAD_DIR
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export async function saveUpload(file: File, subdir: string): Promise<StoredFile> {
  const dir = path.join(UPLOAD_DIR, subdir);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(file.name) || guessExt(file.type);
  const safeBase = nanoid(16);
  const finalName = `${safeBase}${ext}`;
  const fullPath = path.join(dir, finalName);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buf);
  return {
    storedPath: path.join(subdir, finalName).replace(/\\/g, "/"),
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buf.byteLength,
  };
}

export function classifyKind(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function guessExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
  };
  return map[mime] ?? "";
}

export async function readUpload(storedPath: string) {
  const fullPath = path.join(UPLOAD_DIR, storedPath);
  return fs.readFile(fullPath);
}

export function uploadFullPath(storedPath: string) {
  return path.join(UPLOAD_DIR, storedPath);
}

/**
 * Remove every uploaded file belonging to a project. All of a project's
 * attachments and branding live under `uploads/project-<id>/`, so we drop the
 * whole subtree. `force` makes this a no-op if the folder never existed.
 */
export async function deleteProjectUploads(projectId: string) {
  const dir = path.join(UPLOAD_DIR, `project-${projectId}`);
  await fs.rm(dir, { recursive: true, force: true });
}
