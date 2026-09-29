import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  // Override: allow explicit any (existing codebase uses it liberally)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Tests and test utilities use any freely for mocks/stubs.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**", "**/tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Existing comment expansion effects predate this newly enabled React Hooks rule.
  {
    files: ["src/app/community/community-client.tsx", "**/profile-client.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  { ignores: ["coverage/**"] },
];

export default eslintConfig;
