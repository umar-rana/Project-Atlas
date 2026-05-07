export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const SOFT_CONFIRM_BYTES = 25 * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
]);

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: "soft_warn"; message: string };

export function validateFile(
  filename: string,
  contentType: string,
  sizeBytes: number,
): ValidateResult {
  if (sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, error: `File is too large. Maximum allowed size is 100 MB.` };
  }

  const normalizedType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  const isKnownType = ALLOWED_CONTENT_TYPES.has(normalizedType);
  const isOctetStream = normalizedType === "application/octet-stream";

  if (!isKnownType && !isOctetStream) {
    const isKnownExt = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "csv",
      "json",
      "zip",
      "mp4",
      "mov",
      "webm",
      "mp3",
      "wav",
    ].includes(ext);
    if (!isKnownExt) {
      return { ok: false, error: `File type "${contentType}" is not supported.` };
    }
  }

  if (sizeBytes > SOFT_CONFIRM_BYTES) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      ok: "soft_warn",
      message: `This file is ${mb} MB. Are you sure you want to upload it?`,
    };
  }

  return { ok: true };
}

export function classifyContentType(
  contentType: string,
): "image" | "pdf" | "video" | "audio" | "doc" | "other" {
  const t = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (
    t.includes("word") ||
    t.includes("spreadsheet") ||
    t.includes("presentation") ||
    t === "text/plain" ||
    t === "text/markdown" ||
    t === "text/csv"
  )
    return "doc";
  return "other";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
