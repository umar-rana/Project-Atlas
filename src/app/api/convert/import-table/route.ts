import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Papa from "papaparse";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { detectColumns } from "@/core/tables/csv-type-detect";
import {
  checkCsvImportRateLimit,
  RATE_LIMIT_ERROR_MESSAGE,
  runTableImport,
} from "@/core/tables/csv-import-service";

const log = createLogger({ module: "api/convert/import-table" });

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLS = 50;

const ALLOWED_COLUMN_TYPES = new Set<string>([
  "text",
  "number",
  "currency",
  "date",
  "checkbox",
  "single_select",
  "multi_select",
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerk_id: clerkId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkCsvImportRateLimit(user.id)) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR_MESSAGE }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No CSV file provided." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is too large. Maximum size is 10 MB." },
      { status: 400 },
    );
  }

  const tableName = (formData.get("table_name") as string | null)?.trim();
  if (!tableName) {
    return NextResponse.json({ error: "table_name is required." }, { status: 400 });
  }

  const folderIdRaw = formData.get("folder_id") as string | null;
  const projectIdRaw = formData.get("project_id") as string | null;
  const folderId = folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== "" ? folderIdRaw : null;
  const projectId =
    projectIdRaw && projectIdRaw !== "null" && projectIdRaw !== "" ? projectIdRaw : null;

  if (folderId) {
    const folder = await db.tablesFolder.findFirst({
      where: { id: folderId, user_id: user.id, deleted_at: null },
      select: { id: true },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  }
  if (projectId) {
    const project = await db.project.findFirst({
      where: { id: projectId, user_id: user.id, deleted_at: null },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const fileBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(fileBuffer);
  let rawText: string;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(uint8);
    rawText = decoded;
  } catch {
    rawText = new TextDecoder("latin1").decode(uint8);
    log.warn({ userId: user.id }, "CSV import: non-UTF-8 file decoded as Latin-1");
  }

  const parsed = Papa.parse<string[]>(rawText, { skipEmptyLines: true });
  const data = parsed.data as string[][];

  if (data.length < 2) {
    return NextResponse.json(
      { error: "The CSV file has no data rows (only a header row was found)." },
      { status: 400 },
    );
  }

  const csvHeaders = (data[0] ?? []).map((h) => h.trim() || "Column");
  const rows = data.slice(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "The CSV file has no data rows." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows. Maximum is ${MAX_ROWS.toLocaleString()} rows.` },
      { status: 400 },
    );
  }
  if (csvHeaders.length > MAX_COLS) {
    return NextResponse.json(
      { error: `Too many columns. Maximum is ${MAX_COLS}.` },
      { status: 400 },
    );
  }

  let columns: { name: string; type: string }[];
  const rawColumns = formData.get("columns") as string | null;
  if (rawColumns) {
    let parsed2: { name: string; type: string }[];
    try {
      parsed2 = JSON.parse(rawColumns) as { name: string; type: string }[];
      if (!Array.isArray(parsed2) || parsed2.length === 0) throw new Error("empty");
      if (parsed2.length > MAX_COLS) {
        return NextResponse.json(
          { error: `Too many columns. Maximum is ${MAX_COLS}.` },
          { status: 400 },
        );
      }
      for (const c of parsed2) {
        if (!c.name || !c.type || !ALLOWED_COLUMN_TYPES.has(c.type)) {
          return NextResponse.json(
            { error: `Invalid column definition: ${JSON.stringify(c)}` },
            { status: 400 },
          );
        }
      }
    } catch {
      return NextResponse.json({ error: "Invalid columns JSON." }, { status: 400 });
    }
    const count = Math.min(parsed2.length, csvHeaders.length);
    columns = parsed2.slice(0, count);
  } else {
    columns = detectColumns(csvHeaders, rows);
  }

  try {
    const result = await runTableImport({
      user_id: user.id,
      table_name: tableName,
      folder_id: folderId,
      project_id: projectId,
      columns,
      rows,
    });

    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, userId: user.id }, "CSV import failed");
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}
