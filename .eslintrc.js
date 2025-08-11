// .eslintrc.js
import js from "@eslint/js";
import globals from "globals";

export default {
  root: true,
  ignores: ["dist/**", "build/**", "node_modules/**", "**/*.cpp", "**/*.ino"],
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    globals: { ...globals.browser, ...globals.node },
    parser: "@typescript-eslint/parser",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: ["@typescript-eslint"],
  extends: [js.configs.recommended, "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
