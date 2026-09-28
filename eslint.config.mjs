import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

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
