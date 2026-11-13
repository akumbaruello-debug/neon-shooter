import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...next,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "legacy/**",
      "next-env.d.ts",
      "screenshots/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
