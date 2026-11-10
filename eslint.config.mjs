import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "src/lib/supabase/database.types.ts",
  ]),
]);
