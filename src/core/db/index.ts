import { PrismaClient, Prisma } from "@prisma/client";
import { createLogger } from "@/core/logging";
import { uuidv7 } from "uuidv7";
import { INCLUDE_DELETED_KEY } from "./soft-delete";

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      result[key] = { from: before[key], to: after[key] };
    }
  }
  return result;
}

const log = createLogger({ module: "db" });

declare global {
  var __atlasPrisma: PrismaClient | undefined;
}

const SOFT_DELETE_MODELS = new Set([
  "User",
  "Attachment",
  "Task",
  "Project",
  "Context",
  "Tag",
  "Person",
]);

const AUDIT_MODELS = new Set(["User"]);

function createPrismaClient() {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "event", level: "warn" }, { emit: "event", level: "error" }]
        : [{ emit: "event", level: "error" }],
  });

  client.$on("warn" as never, (e: { message: string }) => {
    log.warn({ msg: e.message });
  });
  client.$on("error" as never, (e: { message: string }) => {
    log.error({ msg: e.message });
  });

  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    const model = params.model;

    if (model && params.action === "create") {
      if (params.args && typeof params.args === "object" && "data" in params.args) {
        const data = params.args.data as Record<string, unknown>;
        if (!data.id || data.id === "") {
          data.id = uuidv7();
        }
      }
    }

    if (model && SOFT_DELETE_MODELS.has(model)) {
      if (params.action === "delete") {
        params.action = "update";
        params.args = {
          where: params.args.where,
          data: { deleted_at: new Date() },
        };
      } else if (params.action === "deleteMany") {
        params.action = "updateMany";
        params.args = {
          where: params.args.where,
          data: { deleted_at: new Date() },
        };
      } else if (
        params.action === "findUnique" ||
        params.action === "findFirst" ||
        params.action === "findMany" ||
        params.action === "count" ||
        params.action === "aggregate"
      ) {
        if (!params.args) params.args = {};
        const where = (params.args.where as Record<string, unknown> | undefined) ?? {};
        if (INCLUDE_DELETED_KEY in where) {
          const rest = { ...where };
          delete rest[INCLUDE_DELETED_KEY];
          params.args.where = rest;
        } else if (!("deleted_at" in where)) {
          params.args.where = { ...where, deleted_at: null };
        }
      } else if (
        params.action === "update" ||
        params.action === "updateMany"
      ) {
        // Strip the `includeDeleted` marker so it never reaches Prisma.
        // updateMany does not auto-filter deleted rows.
        if (params.args) {
          const where = (params.args.where as Record<string, unknown> | undefined) ?? {};
          if (INCLUDE_DELETED_KEY in where) {
            const rest = { ...where };
            delete rest[INCLUDE_DELETED_KEY];
            params.args.where = rest;
          }
        }
      }
    }

    if (model && AUDIT_MODELS.has(model) && params.action === "update") {
      const entityId = (params.args.where as Record<string, unknown>)?.id as string | undefined;

      let beforeState: Record<string, unknown> | null = null;
      if (entityId) {
        try {
          beforeState = (await client.user.findUnique({ where: { id: entityId } })) as Record<string, unknown> | null;
        } catch {
          // Non-fatal; proceed without before state
        }
      }

      const result = await next(params);

      if (entityId) {
        try {
          const afterState = result as Record<string, unknown> | null;
          const diff = beforeState && afterState
            ? diffObjects(beforeState, afterState)
            : null;

          if (diff && Object.keys(diff).length > 0) {
            await client.auditLog.create({
              data: {
                id: uuidv7(),
                entity_type: model,
                entity_id: entityId,
                action: "update",
                diff: diff as Prisma.InputJsonValue,
                meta: {
                  before: beforeState,
                  after: afterState,
                } as Prisma.InputJsonValue,
              },
            });
          }
        } catch (err) {
          log.warn({ err }, "Failed to write audit log via middleware");
        }
      }

      return result;
    }

    const result = await next(params);
    return result;
  });

  return client;
}

export const db: PrismaClient =
  globalThis.__atlasPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__atlasPrisma = db;
}

export { PrismaClient };

export function newId(): string {
  return uuidv7();
}
