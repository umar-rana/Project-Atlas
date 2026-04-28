import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

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
            "storybook-static/**",
            "public/**",
            "scripts/**",
            ".local/**",
            ".replit_integration_files/**",
            ".storybook/**",
            "next-env.d.ts",
        ],
    },
    {
        extends: [
            ...compat.extends("next/core-web-vitals"),
            ...compat.extends("prettier"),
            ...compat.extends("plugin:storybook/recommended"),
        ],

        plugins: {
            "@typescript-eslint": typescriptEslint,
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
        },
    },
]);
