export type StorageProviderName = "r2" | "replit";

export interface StorageProvider {
  readonly name: StorageProviderName;

  upload(params: { path: string; data: Buffer; contentType: string }): Promise<void>;

  download(path: string): Promise<Buffer>;

  getUrl(params: { path: string; expiresInSeconds?: number }): Promise<string>;

  delete(path: string): Promise<void>;

  exists(path: string): Promise<boolean>;

  list(prefix: string): Promise<string[]>;
}
