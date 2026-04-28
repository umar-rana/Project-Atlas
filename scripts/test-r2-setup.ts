/**
 * R2 Connectivity Test Script
 *
 * Runs 7 checks against the configured Cloudflare R2 bucket to verify
 * that the storage backend is wired correctly end-to-end.
 *
 * Usage:
 *   npx tsx scripts/test-r2-setup.ts
 *
 * All 7 checks must pass before the app goes live.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getRequiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

async function run(): Promise<void> {
  console.log("=== R2 Connectivity Test ===\n");

  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const publicDomain = getRequiredEnv("R2_PUBLIC_DOMAIN").replace(/\/$/, "");
  const endpoint =
    process.env["R2_ENDPOINT"] ??
    `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const testKey = `_connectivity-test/${Date.now()}.txt`;
  const testContent = `R2 connectivity test at ${new Date().toISOString()}`;
  const testBuffer = Buffer.from(testContent);

  let passed = 0;
  let failed = 0;

  function pass(checkNum: number, label: string, detail?: string): void {
    passed++;
    console.log(`  ✓ [${checkNum}/7] ${label}${detail ? ` — ${detail}` : ""}`);
  }

  function fail(checkNum: number, label: string, err: unknown): void {
    failed++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ [${checkNum}/7] ${label} — FAILED: ${message}`);
  }

  // Check 1: Upload
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testBuffer,
        ContentType: "text/plain",
      }),
    );
    pass(1, "Upload", `key: ${testKey}`);
  } catch (err) {
    fail(1, "Upload", err);
    console.error("\nAborted — upload failed, remaining checks skipped.");
    process.exit(1);
  }

  // Check 2: Exists (HeadObject)
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: testKey }));
    pass(2, "Exists check (HeadObject)");
  } catch (err) {
    fail(2, "Exists check (HeadObject)", err);
  }

  // Check 3: Download and compare
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: testKey }),
    );
    if (!response.Body) throw new Error("No body in download response");
    const bytes = await response.Body.transformToByteArray();
    const downloaded = Buffer.from(bytes).toString("utf-8");
    if (downloaded !== testContent) {
      throw new Error(
        `Content mismatch — expected "${testContent}", got "${downloaded}"`,
      );
    }
    pass(3, "Download + compare", `${bytes.length} bytes match`);
  } catch (err) {
    fail(3, "Download + compare", err);
  }

  // Check 4: getUrl domain check (signed URL uses custom domain)
  let signedUrl: string | null = null;
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: testKey });
    const rawUrl = await getSignedUrl(client, command, { expiresIn: 300 });

    const parsed = new URL(rawUrl);
    const qs = parsed.search;
    signedUrl = `${publicDomain}/${testKey}${qs}`;

    const urlObj = new URL(signedUrl);
    const expectedHost = new URL(publicDomain).host;
    if (urlObj.host !== expectedHost) {
      throw new Error(
        `Expected host "${expectedHost}", got "${urlObj.host}"`,
      );
    }
    if (!urlObj.searchParams.has("X-Amz-Signature")) {
      throw new Error("Signed URL missing X-Amz-Signature query param");
    }
    pass(4, "getUrl domain check", `host: ${urlObj.host}`);
  } catch (err) {
    fail(4, "getUrl domain check", err);
  }

  // Check 5: HTTP fetch via signed URL
  if (signedUrl) {
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText} from signed URL`,
        );
      }
      const text = await res.text();
      if (text !== testContent) {
        throw new Error(
          `HTTP response content mismatch — got "${text.slice(0, 100)}"`,
        );
      }
      pass(5, "HTTP fetch via signed URL", `HTTP ${res.status}`);
    } catch (err) {
      fail(5, "HTTP fetch via signed URL", err);
    }
  } else {
    fail(5, "HTTP fetch via signed URL", new Error("Skipped — no signed URL from check 4"));
  }

  // Build a fresh signed URL for the deleted-object check (check 7).
  // We generate it before deleting so the signature is valid — if R2 serves
  // the object, we'd get 200; after deletion it should return non-200.
  let postDeleteSignedUrl: string | null = null;
  try {
    const preDeleteCommand = new GetObjectCommand({ Bucket: bucket, Key: testKey });
    const rawPreDeleteUrl = await getSignedUrl(client, preDeleteCommand, { expiresIn: 120 });
    const preDeleteParsed = new URL(rawPreDeleteUrl);
    const bucketPrefix = `/${bucket}/`;
    const encodedPath = preDeleteParsed.pathname.startsWith(bucketPrefix)
      ? preDeleteParsed.pathname.slice(bucketPrefix.length)
      : preDeleteParsed.pathname.replace(/^\//, "");
    postDeleteSignedUrl = `${publicDomain}/${encodedPath}${preDeleteParsed.search}`;
  } catch {
    // Non-fatal — check 7 will report skipped
  }

  // Check 6: Delete
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    pass(6, "Delete");
  } catch (err) {
    fail(6, "Delete", err);
  }

  // Check 7: Confirm deleted — HTTP fetch via signed URL must return non-200
  if (postDeleteSignedUrl) {
    try {
      const res = await fetch(postDeleteSignedUrl);
      if (res.ok) {
        fail(7, "Confirm deleted URL returns non-200", new Error(`Expected non-200 but got HTTP ${res.status}`));
      } else {
        pass(7, "Confirm deleted URL returns non-200", `HTTP ${res.status} (expected non-200)`);
      }
    } catch (err) {
      fail(7, "Confirm deleted URL returns non-200", err);
    }
  } else {
    fail(7, "Confirm deleted URL returns non-200", new Error("Skipped — could not generate signed URL for post-delete check"));
  }

  console.log(`\n=== Results: ${passed}/7 passed, ${failed}/7 failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
