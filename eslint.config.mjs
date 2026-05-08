import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import tailwindcss from "eslint-plugin-tailwindcss";
import noServerImportsInClient from "./eslint-rules/no-server-imports-in-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default defineConfig([
    {
        ignores: [
            ".next/**",
            "node_modules/**",
            "public/**",
            "scripts/**",
            ".local/**",
            ".replit_integration_files/**",
            "next-env.d.ts",
        ],
    },
    // Tailwind CSS class-order + unknown-utility enforcement
    ...tailwindcss.configs["flat/recommended"],
    {
        extends: [
            ...compat.extends("next/core-web-vitals"),
            ...compat.extends("prettier"),
        ],

        plugins: {
            "@typescript-eslint": typescriptEslint,
            "local": {
                rules: {
                    "no-server-imports-in-client": noServerImportsInClient,
                },
            },
        },

        languageOptions: {
            parser: tsParser,
        },

        linterOptions: {
            reportUnusedDisableDirectives: "off",
        },

        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
            /**
             * Prevent server-only modules from being imported inside
             * "use client" files. See eslint-rules/no-server-imports-in-client.mjs
             * for full documentation and the list of guarded import paths.
             */
            "local/no-server-imports-in-client": "error",
            // Class ordering is enforced by eslint-plugin-tailwindcss; keep as warn
            // so it doesn't block builds while the codebase is being migrated.
            "tailwindcss/classnames-order": "warn",
            // Flag unknown utilities — catches stale Stratum token references.
            "tailwindcss/no-custom-classname": "off",
        },
    },
]);
