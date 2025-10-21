import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: true,
        document: true,
        console: true,
        navigator: true,
        Event: true,
        setTimeout: true,
        requestAnimationFrame: true,
        CSS: true,
        kintone: true,
        URLSearchParams: true,
        location: true,
        alert: true
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-empty": ["error", { "allowEmptyCatch": true }]
    }
  },
  {
    ignores: ["**/dist/**", "**/ship/**", "**/*.min.js"]
  }
];
