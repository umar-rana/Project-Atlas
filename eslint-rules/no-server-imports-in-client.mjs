/**
 * Custom ESLint rule: no-server-imports-in-client
 *
 * Purpose: Prevent accidental imports of server-only modules inside React
 * Client Components (files that begin with the "use client" directive).
 *
 * Why this matters:
 *   - Modules such as @/core/db, @/core/ai, @/core/storage, and anything under
 *     @/server/ pull in Node.js-only SDKs (Prisma, Anthropic SDK, AWS S3, …).
 *   - Importing them in a "use client" file causes the Next.js bundler to
 *     include that code in the browser bundle, which will fail at runtime and
 *     may expose secrets.
 *   - Each of those modules already has an `import 'server-only'` guard, but
 *     catching the mistake at lint-time (before the build) is faster feedback.
 *
 * Guarded import paths (any string that starts with one of these):
 *   - @/core/db
 *   - @/core/ai
 *   - @/core/storage
 *   - @/server/
 *
 * The rule fires only when the file's first statement is `"use client"`.
 *
 * Exception: `import type` declarations are always allowed because TypeScript
 * and the Next.js bundler erase them before bundling, so they are never
 * included in the browser bundle.
 */

const SERVER_PREFIXES = [
  "@/core/db",
  "@/core/ai",
  "@/core/storage",
  "@/server/",
];

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Disallow imports of server-only modules inside "use client" files',
      recommended: true,
    },
    messages: {
      noServerImportInClient:
        '"{{source}}" is a server-only module and must not be imported from a "use client" file. ' +
        "Move the call to a Server Component, a Route Handler, or a Server Action.",
    },
    schema: [],
  },

  create(context) {
    let isClientFile = false;

    return {
      Program(node) {
        const firstStatement = node.body[0];
        if (
          firstStatement &&
          firstStatement.type === "ExpressionStatement" &&
          firstStatement.expression.type === "Literal" &&
          firstStatement.expression.value === "use client"
        ) {
          isClientFile = true;
        }
      },

      ImportDeclaration(node) {
        if (!isClientFile) return;

        // `import type` is erased at compile time — it is safe in client files
        // because TypeScript and the Next.js bundler strip it before bundling.
        if (node.importKind === "type") return;

        const source = node.source.value;
        const isServerImport = SERVER_PREFIXES.some((prefix) => {
          // For prefixes already ending with "/" (e.g. "@/server/"), a plain
          // startsWith check is both correct and sufficient.
          // For prefixes without a trailing slash (e.g. "@/core/db"), require
          // an exact match OR the source to continue with "/" so that a module
          // like "@/core/dbx" is not incorrectly flagged.
          if (prefix.endsWith("/")) return source.startsWith(prefix);
          return source === prefix || source.startsWith(prefix + "/");
        });

        if (isServerImport) {
          context.report({
            node,
            messageId: "noServerImportInClient",
            data: { source },
          });
        }
      },
    };
  },
};

export default rule;
