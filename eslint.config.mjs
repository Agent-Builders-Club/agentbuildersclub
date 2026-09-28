import { createRequire } from "node:module";
import { dirname } from "node:path";
import { FlatCompat } from "@eslint/eslintrc";

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  // Resolve Next's plugins from its matching config version under pnpm.
  resolvePluginsRelativeTo: dirname(
    require.resolve("eslint-config-next/package.json"),
  ),
});

const eslintConfig = [
  ...compat.config({ extends: ["next/core-web-vitals", "next/typescript"] }),
  // Override: allow explicit any (existing codebase uses it liberally)
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
  // Override: tests and test utilities use `any` freely for mocks/stubs,
  // and have unused destructured params (field1, value2, etc.) used by mock frameworks
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**", "**/tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Preserve the default Next.js ignores.
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
