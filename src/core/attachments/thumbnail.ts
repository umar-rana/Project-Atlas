import { createLogger } from "@/core/logging";
import { storage } from "@/core/storage";
import { storagePath } from "@/core/storage/paths";

const log = createLogger({ module: "attachments/thumbnail" });

export function thumbnailPath(userId: string, fileId: string, filename: string): string {
  const base = storagePath(userId, fileId, filename);
  const dir = base.substring(0, base.lastIndexOf("/"));
  return `${dir}/thumb_${fileId}.webp`;
}

export async function generateImageThumbnail(
  data: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(data);
    const meta = await image.metadata();

    const resized = await image
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: resized.data,
      width: meta.width ?? resized.info.width,
      height: meta.height ?? resized.info.height,
    };
  } catch (err) {
    log.warn({ err, contentType }, "Failed to generate image thumbnail");
    return null;
  }
}

export async function storeThumbnail(params: {
  userId: string;
  fileId: string;
  filename: string;
  data: Buffer;
  contentType: string;
}): Promise<{ path: string; width: number; height: number } | null> {
  const isImage = params.contentType.startsWith("image/");
  if (!isImage) return null;

  const result = await generateImageThumbnail(params.data, params.contentType);
  if (!result) return null;

  const path = thumbnailPath(params.userId, params.fileId, params.filename);

  try {
    await storage.upload({ path, data: result.buffer, contentType: "image/webp" });
    return { path, width: result.width, height: result.height };
  } catch (err) {
    log.warn({ err, path }, "Failed to store thumbnail");
    return null;
  }
}
