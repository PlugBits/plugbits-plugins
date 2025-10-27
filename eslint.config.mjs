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
  },
  {
    files: ["scripts/**/*.mjs", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Nodeグローバル
        process: true,
        console: true,
        __dirname: true,  // 使わなければなくてもOK
        __filename: true,
        Buffer: true
      }
    },
    rules: {
      // Nodeスクリプトは未使用変数ゆるめたいならここで調整も可
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
];
