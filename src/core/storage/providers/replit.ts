import 'server-only';
import { Client } from "@replit/object-storage";
import type { StorageProvider, StorageProviderName } from "../types";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "storage/replit" });

export class ReplitProvider implements StorageProvider {
  readonly name: StorageProviderName = "replit";

  private readonly client: Client;

  constructor() {
    this.client = new Client();
    log.warn(
      {},
      "ReplitProvider is active — this is a rollback stub. Replit Object Storage contains no files. Switch STORAGE_PROVIDER=r2 for normal operation.",
    );
  }

  async upload(params: {
    path: string;
    data: Buffer;
    contentType: string;
  }): Promise<void> {
    const result = await this.client.uploadFromBytes(params.path, params.data);
    if (!result.ok) {
      throw new Error(`Replit storage upload failed: ${result.error}`);
    }
  }

  async download(path: string): Promise<Buffer> {
    const result = await this.client.downloadAsBytes(path);
    if (!result.ok) {
      throw new Error(`Replit storage download failed: ${result.error}`);
    }
    return Buffer.from(result.value[0] as Uint8Array);
  }

  async getUrl(_params: {
    path: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    throw new Error(
      "ReplitProvider does not support signed URLs. Switch STORAGE_PROVIDER=r2.",
    );
  }

  async delete(path: string): Promise<void> {
    const result = await this.client.delete(path);
    if (!result.ok) {
      log.warn({ path, err: result.error }, "Replit storage delete failed");
    }
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.client.downloadAsBytes(path);
    return result.ok;
  }

  async list(prefix: string): Promise<string[]> {
    const result = await this.client.list({ prefix });
    if (!result.ok) {
      throw new Error(`Replit storage list failed: ${result.error}`);
    }
    return result.value.map((obj) => obj.name);
  }
}
