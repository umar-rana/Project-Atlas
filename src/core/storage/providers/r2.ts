import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StorageProviderName } from "../types";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "storage/r2" });

function getRequiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export class R2Provider implements StorageProvider {
  readonly name: StorageProviderName = "r2";

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicDomain: string;

  constructor() {
    const accountId = getRequiredEnv("R2_ACCOUNT_ID");
    const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
    this.bucket = getRequiredEnv("R2_BUCKET_NAME");
    this.publicDomain = getRequiredEnv("R2_PUBLIC_DOMAIN").replace(/\/$/, "");

    const endpoint =
      process.env["R2_ENDPOINT"] ??
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    log.info({ bucket: this.bucket, domain: this.publicDomain }, "R2 provider initialised");
  }

  async upload(params: {
    path: string;
    data: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.path,
        Body: params.data,
        ContentType: params.contentType,
      }),
    );
  }

  async download(path: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
    );
    if (!response.Body) {
      throw new Error(`R2 download returned no body for key: ${path}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getUrl(params: {
    path: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const expiresIn = params.expiresInSeconds ?? 3600;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.path,
    });

    const signedUrl = await getSignedUrl(this.client, command, { expiresIn });

    const parsed = new URL(signedUrl);
    const qs = parsed.search;

    // The signed URL pathname is /<bucket>/<key> — strip the leading /<bucket>/ prefix
    // so we get just the key portion (with proper URL encoding preserved).
    const bucketPrefix = `/${this.bucket}/`;
    const encodedPath = parsed.pathname.startsWith(bucketPrefix)
      ? parsed.pathname.slice(bucketPrefix.length)
      : parsed.pathname.replace(/^\//, "");

    const rewritten = `${this.publicDomain}/${encodedPath}${qs}`;
    return rewritten;
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: path }),
    );
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: path }),
      );
      return true;
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name;
      if (code === "NotFound" || code === "NoSuchKey") return false;
      throw err;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}
