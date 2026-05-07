# Cloudflare R2 Storage — Setup & Architecture

## Overview

Atlas uses Cloudflare R2 as its object storage backend for file attachments. Files are served through a branded custom domain (`atlasstore.insightive.io`) using time-limited signed URLs that expire after one hour.

## Architecture

```
Client request
    │
    ▼
/api/attachments/[fileId]  (Next.js route)
    │  Generates a signed URL (1 hour TTL)
    ▼
302 Redirect
    │
    ▼
atlasstore.insightive.io/<path>?X-Amz-Signature=...
    │  Cloudflare R2 validates the signature
    ▼
File bytes delivered directly to the client
```

Files are **never proxied** through Next.js — the server generates a signed URL and redirects the browser to it. R2 validates the signature and serves the bytes directly, keeping our server out of the hot path.

## Configuration

### Environment Variables / Secrets

All storage secrets are stored in Replit Secrets (never in code):

| Variable               | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare account ID                                                   |
| `R2_ACCESS_KEY_ID`     | R2 API token access key                                                 |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key                                                 |
| `R2_BUCKET_NAME`       | Bucket name (`projectatlas`)                                            |
| `R2_ENDPOINT`          | S3-compatible endpoint (`https://<accountId>.r2.cloudflarestorage.com`) |
| `R2_PUBLIC_DOMAIN`     | Custom domain for signed URLs (`https://atlasstore.insightive.io`)      |

### Provider Selection

| Variable           | Description      | Default |
| ------------------ | ---------------- | ------- |
| `STORAGE_PROVIDER` | `r2` or `replit` | `r2`    |

Set via Replit environment variables (shared, so it applies to both dev and prod).

## Signed URL Generation

The AWS SDK generates a pre-signed `GetObject` URL against the S3-compatible R2 endpoint. The signature uses the bucket-hosted hostname by default. We then rewrite the URL to use the custom domain:

1. Generate signed URL against `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>?...`
2. Strip the bucket-name path prefix from the URL path
3. Replace the hostname with `atlasstore.insightive.io`
4. Preserve the full query string (all signature components)

Result: `https://atlasstore.insightive.io/users/<userId>/attachments/<year>/<month>/<fileId>-<filename>?X-Amz-Signature=...`

**Default expiry**: 3600 seconds (1 hour).

## Storage Path Format

```
users/<userId>/attachments/<year>/<month>/<fileId>-<filename>
```

Example: `users/usr_abc123/attachments/2026/04/file_xyz789-report.pdf`

Path logic lives in `src/core/storage/paths.ts`.

## Client-Side Discipline

**Never persist signed URLs.** Signed URLs are time-limited and must be generated fresh for each download. Rules:

- Do not store signed URLs in the database
- Do not cache signed URLs beyond the browser session
- Do not include signed URLs in API responses that get cached long-term
- Always call `/api/attachments/[fileId]` to fetch fresh URLs

## Code Organization

```
src/core/storage/
├── types.ts           # StorageProvider interface + StorageProviderName type
├── paths.ts           # File path generation logic
├── index.ts           # Provider selector + high-level functions (uploadFile, getFile, etc.)
└── providers/
    ├── r2.ts          # Cloudflare R2 via AWS SDK (active provider)
    └── replit.ts      # Replit Object Storage stub (rollback only)
```

## Rollback Instructions

If you need to roll back to Replit Object Storage:

1. Set `STORAGE_PROVIDER=replit` in Replit Secrets
2. Restart the application
3. Note: The Replit provider will log a warning on startup
4. Note: `getUrl()` is not supported in the Replit provider — any attachment download will fail with a clear error

**Important**: Because Replit Object Storage is empty (no files were ever stored there), rolling back means attachments uploaded while R2 was active will not be accessible. The rollback path is only intended as a break-glass option before any real files are stored.

## Connectivity Test

Run the connectivity test to verify R2 is wired correctly:

```bash
npx tsx scripts/test-r2-setup.ts
```

The script runs 7 checks:

1. Upload a test file to R2
2. Verify the file exists (HeadObject)
3. Download the file and compare contents
4. Generate a signed URL and verify it uses the custom domain
5. Fetch the file via the signed URL over HTTP and verify contents
6. Delete the test file
7. Confirm the deleted file returns a non-200 response

All 7 must pass for the storage backend to be considered healthy.

## Health Check

The `/admin/health` page and `health.full` tRPC endpoint include an `object_storage` check that:

- Uploads a tiny test file
- Downloads it
- Deletes it
- Reports the active provider name (e.g., `provider: r2`)
