# Replit Agent Prompt — Atlas Object Storage Setup with Cloudflare R2

## Read this entire prompt before taking any action.

---

## 1. Context

Atlas's database has been migrated to user-owned Neon. The next infrastructure step is wiring Cloudflare R2 as the object storage backend.

**Important context:** Replit Object Storage currently has zero files. The Attachment table has zero records. This is therefore not a *migration* — it's a fresh setup where R2 becomes the primary (and only) storage backend before any user attaches anything to Atlas.

This dramatically simplifies the work:
- No file copying needed
- No bulk migration script needed
- No verification of file integrity needed
- The work is: build the storage abstraction, wire R2 with signed URL support, swap the provider

**This prompt covers Object Storage setup only.** No database changes. No application feature changes. No Wave work.

---

## 2. Pre-requisites — already complete

The user has completed setup:

- [x] Cloudflare account with R2 enabled
- [x] R2 bucket created: `projectatlas` in Asia-Pacific (APAC) region
- [x] Custom domain configured: `atlas.insightive.io` is active and bound to the bucket
- [x] R2 API token with read/write access to the bucket
- [x] Replit Secrets configured:
  - `R2_ACCOUNT_ID` — Cloudflare account ID
  - `R2_ACCESS_KEY_ID` — R2 token's access key
  - `R2_SECRET_ACCESS_KEY` — R2 token's secret key
  - `R2_BUCKET_NAME` = `projectatlas`
  - `R2_ENDPOINT` — full S3 API endpoint URL (e.g., `https://4198ae74436ce79fd3674316ecb15ec0.r2.cloudflarestorage.com`)
  - `R2_PUBLIC_DOMAIN` = `atlas.insightive.io` (the custom domain that serves files)

If any of these secrets are not set, stop and ask the user before proceeding.

---

## 3. Architecture decision: signed URLs via custom domain

The user wants:
- The custom domain `atlas.insightive.io` visible in URL paths (branded, clean)
- Authentication required to access actual file content (not just public access via obscure URLs)

The chosen approach is **signed URLs through the custom domain**. URLs will look like:

```
https://atlas.insightive.io/users/{user_id}/attachments/{file_id}/{filename}?X-Amz-Signature=...&X-Amz-Expires=3600&...
```

Properties:
- The `atlas.insightive.io` domain is preserved
- The path remains clean and meaningful
- A signature query string is appended that proves the URL was issued by Atlas's server with a valid R2 token
- URLs expire (default 1 hour); after expiration, the URL returns 403
- Atlas regenerates fresh signed URLs on each render — clients never persist signed URLs longer than a session

This gets the branding benefit of the custom domain, the security benefit of expiring auth tokens, without the complexity of Cloudflare Access or app-level proxying.

### How signed URLs work with custom domains

Cloudflare R2 signs URLs using the bucket's **S3 API endpoint** (e.g., `https://4198....r2.cloudflarestorage.com/projectatlas/path`). When you have a custom domain bound to the bucket, the same signed URL is also valid at `https://atlas.insightive.io/path` — Cloudflare routes requests at the custom domain to the underlying bucket and validates the signature using the same logic.

This means:
- Sign URLs using the standard S3 SDK presigned URL functions
- Replace the domain portion of the resulting URL with the custom domain before returning to the client
- The signature remains valid because Cloudflare validates against the underlying bucket, not the hostname

The R2 provider implementation in section 5 handles this domain rewriting cleanly.

---

## 4. Setup overview

The work proceeds in this sequence:

1. **Storage abstraction layer** — define the interface and provider pattern so Atlas can switch backends cleanly
2. **R2 provider implementation** — with custom domain signed URL support
3. **Replit provider stub** — minimal implementation kept for emergency rollback (won't be used unless explicitly toggled)
4. **Provider selector** — reads `STORAGE_PROVIDER` env var, defaults to `r2`
5. **Connectivity test** — verify R2 credentials work end-to-end before involving the live app
6. **Wire into Atlas** — update all storage call sites to use the abstraction
7. **End-to-end test** — upload an attachment via Atlas, view it, delete it
8. **Document the setup** — record the architecture for future reference

No data migration phase exists because there's nothing to migrate.

---

## 5. Storage abstraction layer

### 5.1 Define the provider interface

Create `core/storage/types.ts`:

```typescript
export interface StorageProvider {
  /** Upload a file. Returns the storage path (key) and size. */
  upload(path: string, data: Buffer, contentType: string): Promise<{ path: string; size: number }>
  
  /** Download a file. Returns the raw bytes. */
  download(path: string): Promise<Buffer>
  
  /** 
   * Get a URL for accessing the file.
   * For R2 with custom domain: returns a signed URL using the custom domain.
   * Default expiration: 3600 seconds (1 hour).
   */
  getUrl(path: string, options?: { expiresIn?: number }): Promise<string>
  
  /** Delete a file. */
  delete(path: string): Promise<void>
  
  /** Check if a file exists. */
  exists(path: string): Promise<boolean>
  
  /** List files with optional prefix filter. */
  list(prefix?: string): Promise<string[]>
  
  /** Provider name for logging/health checks. */
  readonly name: string
}

export type StorageProviderName = 'replit' | 'r2'
```

### 5.2 R2 provider implementation

Install AWS SDK if not present:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Create `core/storage/providers/r2.ts`:

```typescript
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command 
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageProvider } from '../types'

export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2'
  
  private client: S3Client
  private bucket: string
  private publicDomain: string
  private endpoint: string
  
  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET_NAME
    const endpoint = process.env.R2_ENDPOINT
    const publicDomain = process.env.R2_PUBLIC_DOMAIN
    
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint || !publicDomain) {
      throw new Error('R2 storage provider missing required environment variables')
    }
    
    this.bucket = bucket
    this.endpoint = endpoint
    this.publicDomain = publicDomain
    
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    })
  }
  
  async upload(path: string, data: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: path,
      Body: data,
      ContentType: contentType,
    }))
    return { path, size: data.length }
  }
  
  async download(path: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }))
    if (!response.Body) throw new Error(`No body in response for ${path}`)
    
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  
  /**
   * Generate a signed URL for the given path.
   * Returns a URL using the custom domain (e.g., atlas.insightive.io) with
   * the signature query string appended. The signature remains valid because
   * Cloudflare routes custom domain requests to the underlying bucket.
   */
  async getUrl(path: string, options?: { expiresIn?: number }): Promise<string> {
    const expiresIn = options?.expiresIn ?? 3600
    
    // Generate signed URL using S3 endpoint
    const signedUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      { expiresIn }
    )
    
    // Replace the S3 endpoint domain with the custom domain
    // signedUrl format: https://{accountId}.r2.cloudflarestorage.com/{bucket}/{path}?signature...
    // Target format:    https://atlas.insightive.io/{path}?signature...
    const url = new URL(signedUrl)
    
    // The path in the signed URL includes the bucket name as a prefix; strip it
    const bucketPrefix = `/${this.bucket}/`
    let pathname = url.pathname
    if (pathname.startsWith(bucketPrefix)) {
      pathname = pathname.substring(bucketPrefix.length - 1)  // keep leading slash
    }
    
    return `https://${this.publicDomain}${pathname}${url.search}`
  }
  
  async delete(path: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: path,
    }))
  }
  
  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }))
      return true
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false
      throw err
    }
  }
  
  async list(prefix?: string): Promise<string[]> {
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    }))
    return (response.Contents || []).map(obj => obj.Key!).filter(Boolean)
  }
}
```

**Critical detail about the URL rewriting:** the AWS SDK generates signed URLs using the format `https://{endpoint}/{bucket}/{path}?signature`. The custom domain serves the bucket directly, so the URL needs to be rewritten to `https://{customDomain}/{path}?signature`. This is what the URL rewriting in `getUrl()` does. Test this carefully — getting it wrong means signed URLs return 403.

### 5.3 Replit provider stub (rollback safety)

Even though no data exists in Replit Object Storage, keep a Replit provider implementation available as a rollback path. If for any reason R2 needs to be temporarily disabled, swapping `STORAGE_PROVIDER` back to `replit` should still work without throwing errors.

Create `core/storage/providers/replit.ts` with a minimal viable implementation using Replit's Object Storage SDK (the existing patterns in the codebase, if any). If the SDK isn't installed and there's no prior Replit storage code, create stubs that throw clear "Replit storage not available" errors — the goal is graceful degradation if someone toggles the provider, not a full implementation.

### 5.4 Provider selector

Create `core/storage/index.ts`:

```typescript
import type { StorageProvider } from './types'
import { R2StorageProvider } from './providers/r2'
import { ReplitStorageProvider } from './providers/replit'

let cachedProvider: StorageProvider | null = null

export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider
  
  const providerName = process.env.STORAGE_PROVIDER ?? 'r2'
  
  switch (providerName) {
    case 'r2':
      cachedProvider = new R2StorageProvider()
      break
    case 'replit':
      cachedProvider = new ReplitStorageProvider()
      break
    default:
      throw new Error(`Unknown storage provider: ${providerName}`)
  }
  
  return cachedProvider
}

// Convenience exports for common operations
export const storage = {
  upload: (path: string, data: Buffer, contentType: string) =>
    getStorageProvider().upload(path, data, contentType),
  download: (path: string) =>
    getStorageProvider().download(path),
  getUrl: (path: string, options?: { expiresIn?: number }) =>
    getStorageProvider().getUrl(path, options),
  delete: (path: string) =>
    getStorageProvider().delete(path),
  exists: (path: string) =>
    getStorageProvider().exists(path),
  list: (prefix?: string) =>
    getStorageProvider().list(prefix),
  providerName: () => getStorageProvider().name,
}
```

Default provider is `r2`. Setting `STORAGE_PROVIDER=replit` swaps to the (mostly stub) Replit implementation.

### 5.5 Update path generation

Atlas presumably has logic for generating storage paths for new attachments (something like `users/{user_id}/attachments/{year}/{month}/{file_id}-{filename}`). Verify this path generation logic exists and works correctly. The R2 provider treats whatever path is passed in as opaque — it doesn't care about path structure, but consistent paths matter for the `list()` operations and for predictable file organization.

If the path generation logic is currently in storage code that's being refactored, move it to a clear location like `core/storage/paths.ts` so it's separate from provider implementations.

---

## 6. Connectivity test

Before wiring R2 into the live application, verify R2 credentials and the signed URL flow work end-to-end.

Create `scripts/test-r2-setup.ts`:

```typescript
import { R2StorageProvider } from '../core/storage/providers/r2'

async function main() {
  console.log('Testing R2 storage provider setup...\n')
  
  const r2 = new R2StorageProvider()
  
  const testPath = `_setup_test/test-${Date.now()}.txt`
  const testContent = Buffer.from('Atlas R2 setup test — safe to delete')
  
  console.log('1. Upload test file')
  const uploadResult = await r2.upload(testPath, testContent, 'text/plain')
  console.log(`   ✓ Uploaded ${uploadResult.size} bytes to ${uploadResult.path}\n`)
  
  console.log('2. Verify exists')
  const exists = await r2.exists(testPath)
  if (!exists) throw new Error('exists() returned false after upload')
  console.log('   ✓ File exists\n')
  
  console.log('3. Download and compare')
  const downloaded = await r2.download(testPath)
  if (!downloaded.equals(testContent)) throw new Error('Downloaded content does not match')
  console.log('   ✓ Downloaded content matches\n')
  
  console.log('4. Generate signed URL with custom domain')
  const signedUrl = await r2.getUrl(testPath, { expiresIn: 60 })
  console.log(`   URL: ${signedUrl.substring(0, 100)}...`)
  
  // Verify URL uses custom domain
  if (!signedUrl.startsWith('https://atlas.insightive.io/')) {
    throw new Error(`Signed URL does not use custom domain. Got: ${signedUrl.substring(0, 60)}`)
  }
  if (!signedUrl.includes('X-Amz-Signature')) {
    throw new Error('Signed URL is missing signature query string')
  }
  console.log('   ✓ URL uses custom domain with signature\n')
  
  console.log('5. Fetch the signed URL via HTTP to verify it works')
  const response = await fetch(signedUrl)
  if (!response.ok) {
    throw new Error(`Signed URL returned ${response.status}: ${await response.text()}`)
  }
  const fetchedContent = Buffer.from(await response.arrayBuffer())
  if (!fetchedContent.equals(testContent)) {
    throw new Error('Content fetched via signed URL does not match original')
  }
  console.log('   ✓ Signed URL serves the file correctly\n')
  
  console.log('6. Delete test file')
  await r2.delete(testPath)
  const stillExists = await r2.exists(testPath)
  if (stillExists) throw new Error('exists() still returned true after delete')
  console.log('   ✓ Deleted successfully\n')
  
  console.log('7. Verify deleted file URL returns 403/404')
  const deletedUrl = await r2.getUrl(testPath, { expiresIn: 60 })
  const deletedResponse = await fetch(deletedUrl)
  if (deletedResponse.ok) {
    throw new Error('Signed URL for deleted file returned 200 — should be 404')
  }
  console.log(`   ✓ Deleted file URL returns ${deletedResponse.status}\n`)
  
  console.log('All R2 setup tests passed ✓')
}

main().catch(err => {
  console.error('\n✗ Setup test failed:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
```

Run:

```bash
npx tsx scripts/test-r2-setup.ts
```

All 7 tests must pass. Step 5 (fetch via signed URL) is the most important — it verifies the entire chain: SDK signs the URL, custom domain accepts the request, Cloudflare validates the signature, file is served. If this step fails, R2 won't work for Atlas's actual use cases.

**Common failure modes:**
- Step 4 fails (URL doesn't use custom domain): the URL rewriting logic in `getUrl()` is wrong
- Step 5 returns 403: signature invalid (likely SDK configuration issue with endpoint)
- Step 5 returns 404 from custom domain: custom domain not properly bound to bucket
- Step 5 returns 401/redirect: Cloudflare Access or some other policy is interfering

If any test fails, diagnose and fix before proceeding to wire R2 into Atlas.

---

## 7. Wire R2 into Atlas

### 7.1 Find all current storage call sites

Search the codebase for any existing storage operations:

```bash
grep -r "@replit/object-storage\|object-storage" --include="*.ts" --include="*.tsx" .
grep -r "storage\." --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -i "upload\|download\|getUrl\|delete"
```

Identify all places that:
- Upload attachments (likely in capture flow, attachment endpoints)
- Generate URLs to display attachments
- Delete files (likely in trash cleanup, task deletion if hard delete)
- Anywhere else file storage is touched

### 7.2 Update call sites to use the abstraction

All call sites should now import from `core/storage`:

```typescript
import { storage } from '@/core/storage'

// Upload
const result = await storage.upload(path, buffer, contentType)

// Get URL for display
const url = await storage.getUrl(attachment.storage_path)

// Delete
await storage.delete(path)
```

If there were no prior storage call sites (since Replit Storage is empty, maybe the integration was never wired), create the integration points now where they should exist:
- A tRPC procedure for uploading attachments to a task or note
- A tRPC procedure for getting the display URL for an attachment
- Wherever attachment display logic lives in the UI

### 7.3 Set the active provider

In Replit Secrets:

- Set `STORAGE_PROVIDER=r2` (this becomes the active provider)

### 7.4 Restart the application

Restart Atlas. Verify on startup:

1. No errors related to storage provider initialization
2. `/admin/health` Storage check shows green
3. The health check should report which provider is active (`r2`)

### 7.5 Update health check

Verify (or implement if missing) that `/admin/health` includes a Storage check that:

1. Calls `storage.providerName()` to confirm the active provider
2. Performs a small operation (e.g., `storage.exists('_health_check')`) to verify connectivity
3. Returns provider name and status to the health dashboard

---

## 8. End-to-end test through the live application

The user — not the agent — must verify the live application:

1. **Capture a new task with an attachment**:
   - Open capture modal (⌘⇧I)
   - Drag a small image into the modal (or whatever the attachment UX is)
   - Submit
   - Task created
   - Attachment uploaded to R2

2. **View the attachment**:
   - Open the new task
   - Inspector shows the attachment
   - Image renders correctly
   - URL in browser dev tools (Network tab) starts with `https://atlas.insightive.io/`
   - URL has a signature query string

3. **Refresh and view again**:
   - Refresh the page
   - Open the same task
   - Attachment renders (verifies fresh signed URL was generated)

4. **Wait for URL expiration test**:
   - Copy the signed URL from dev tools
   - Wait 65 minutes (or temporarily set expiration to 60 seconds in code for faster test)
   - Try to access the URL directly in a new tab
   - Should return 403 (signature expired)

5. **Upload a non-image file** (PDF, document):
   - Upload a PDF
   - View the task
   - Verify the file is downloadable via the signed URL

6. **Delete a task with attachment**:
   - Soft-delete a task that has an attachment
   - Attachment should still be loadable while task is in trash (file not yet deleted from R2)
   - Restore the task → attachment loads correctly
   - Hard-delete (empty trash) → attachment deleted from R2

7. **Verify in Cloudflare R2 dashboard**:
   - Open Cloudflare → R2 → projectatlas bucket
   - See the uploaded files in the bucket
   - Verify file paths look correct (matching Atlas's path generation pattern)

8. **Health check sanity**:
   - `/admin/health` shows Storage section green
   - Storage provider listed as `r2`

The user runs through all 8 steps. Wait for explicit confirmation: **"All 8 steps verified. R2 storage is working correctly."**

---

## 9. Document the setup

Create `/docs/storage/r2-setup.md`:

```markdown
# Atlas Storage Setup: Cloudflare R2

**Date configured:** [actual date]

## Architecture

Atlas uses Cloudflare R2 as its object storage backend, with files served through the custom domain `atlas.insightive.io`. Authentication is handled via signed URLs that include a time-limited signature query string.

## Configuration

- **Bucket:** `projectatlas` (Asia-Pacific region)
- **Custom domain:** `atlas.insightive.io` (active, bound to bucket)
- **Active provider:** R2 (controlled by `STORAGE_PROVIDER` env var; default `r2`)
- **URL pattern:** `https://atlas.insightive.io/{path}?X-Amz-Signature=...&X-Amz-Expires=3600`
- **Default URL expiration:** 1 hour (3600 seconds)

## Environment variables

In Replit Secrets:
- `STORAGE_PROVIDER=r2` — selects R2 as active provider
- `R2_ACCOUNT_ID` — Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 token access key
- `R2_SECRET_ACCESS_KEY` — R2 token secret key
- `R2_BUCKET_NAME=projectatlas`
- `R2_ENDPOINT` — full S3 API endpoint URL
- `R2_PUBLIC_DOMAIN=atlas.insightive.io`

## Code structure

- `core/storage/types.ts` — StorageProvider interface
- `core/storage/providers/r2.ts` — R2 implementation with custom domain signed URLs
- `core/storage/providers/replit.ts` — Replit stub (rollback only)
- `core/storage/index.ts` — provider selector and convenience exports

## URL signing details

R2's signed URLs are generated using the AWS SDK's `getSignedUrl()` against the S3 API endpoint. The R2 provider rewrites the resulting URL to use the custom domain — Cloudflare routes custom domain requests to the underlying bucket and validates the signature, so the substitution preserves auth correctness while improving URL aesthetics.

## Client-side discipline

The frontend MUST regenerate signed URLs on each render. Never persist signed URLs in client state (Zustand, localStorage, etc.) for longer than a session — they expire and become 403s. The pattern is:

- On render: ask server for current URL via tRPC → returns signed URL
- Browser caches actual file content based on response headers
- Next render: ask server again for fresh URL

## Rollback

If R2 needs to be temporarily disabled:
1. Set `STORAGE_PROVIDER=replit` in Replit Secrets
2. Restart application
3. Note: Replit storage is currently empty, so this rollback would only work if there were also no R2-stored files (i.e., very early). After files exist in R2, true rollback would require a reverse migration.

## Cost expectations

R2 pricing (as of setup):
- Storage: $0.015/GB/month
- Class A operations (writes): $4.50 per million
- Class B operations (reads): $0.36 per million
- Egress: free (key R2 advantage)

For Atlas at family/friends scale, expected cost: well under $1/month. Free tier covers 10GB storage and 1M Class A ops monthly.
```

---

## 10. Rules of engagement

### 10.1 No data migration in this session

Replit Object Storage is empty. There is nothing to migrate. If the agent finds itself building file copy logic, it has misunderstood the scope.

### 10.2 Storage abstraction is the architectural win

The provider interface is what makes future provider changes trivial. Don't bypass it for "convenience" — every storage call goes through the abstraction. Direct calls to R2 SDK from feature code are forbidden.

### 10.3 Custom domain URL rewriting is the most fragile part

Generating a signed URL via the SDK gives you a URL with the S3 endpoint domain. Substituting the custom domain must be done correctly:
- Strip the `/bucket-name/` prefix from the path (custom domain serves bucket root directly)
- Preserve the leading slash on the path
- Preserve the entire query string (signature, expiration, etc.)

The connectivity test in section 6 specifically verifies this works end-to-end. If you change the rewriting logic, re-run the test.

### 10.4 Signed URLs are ephemeral

URLs expire. Frontend code that displays attachments must regenerate URLs on each render, not cache them. This is documented in section 9. Make sure the integration points (tRPC procedures, UI components) follow this pattern.

### 10.5 Don't enable Cloudflare Access on the custom domain

The signed URL approach is incompatible with Cloudflare Access policies on the same domain. If both are enabled, requests get auth-checked twice — first by Cloudflare Access (which knows nothing about Atlas users), then by R2's signature check. Users would see Cloudflare login prompts they shouldn't see.

If at any point Cloudflare Access is needed, it requires switching the architecture to "Option 1" (Cloudflare Access auth instead of signed URLs) — that's a future migration, not part of this setup.

### 10.6 Credentials hygiene

Never log R2 credentials. Reference them by env var name only. The connectivity test reads env vars but never echoes their values in output.

### 10.7 Stop and ask if anything is unclear

If at any step something doesn't match expectations:
- Connectivity test fails
- Signed URLs return 403 unexpectedly
- Custom domain doesn't serve files
- Health check fails after enabling R2

Stop. Show the user what's happening. Get input before continuing.

---

## 11. Definition of Done

The setup is complete when:

- [ ] Storage abstraction layer implemented (`core/storage/`)
- [ ] R2 provider with custom domain signed URL support
- [ ] Replit provider stub for rollback safety
- [ ] Provider selector reads `STORAGE_PROVIDER` env var
- [ ] All 7 connectivity tests pass (especially HTTP fetch via signed URL)
- [ ] Storage call sites in Atlas use the abstraction
- [ ] `STORAGE_PROVIDER=r2` set in Replit Secrets
- [ ] Application starts cleanly with R2 active
- [ ] `/admin/health` Storage check green, provider reported as `r2`
- [ ] All 8 user verification steps pass
- [ ] Setup documented in `/docs/storage/r2-setup.md`

---

## 12. What's NOT in this session

Do not do any of the following:

- Migrate data (Replit storage is empty; nothing to migrate)
- Database schema changes or data manipulation
- Application feature work (capture flows, attachment UX, etc.)
- Change the R2 bucket configuration (region, custom domain settings)
- Implement Cloudflare Access (incompatible with signed URLs)
- Build attachment management UI beyond what already exists
- Address unrelated bugs
- Optimize R2 settings beyond what's needed for setup

If asked to do any of these, decline and explain that this session is R2 setup only.

---

## 13. Final note

This setup makes Cloudflare R2 the storage backend for Atlas attachments from day one, with files served through the branded custom domain `atlas.insightive.io` and protected by signed URL authentication. The combination preserves URL aesthetics while ensuring files are not publicly accessible without a valid Atlas-issued signature.

The storage abstraction layer means future provider changes (Backblaze B2, AWS S3 directly, self-hosted Minio, etc.) are clean implementation swaps rather than codebase rewrites.

Begin with section 5.1.
