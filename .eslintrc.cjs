/** @type { import('eslint').ESLint.ConfigData } */
const config = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.eslint.json", "./spec/tsconfig.json"],
  },
  plugins: ["@typescript-eslint", "import", "lodash"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
    "plugin:import/typescript",
    "plugin:lodash/recommended",
  ],
  env: {
    node: true,
  },
  rules: {
    "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
    "@typescript-eslint/member-ordering": ["warn"],
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        selector: "memberLike",
        modifiers: ["private"],
        format: ["camelCase"],
        leadingUnderscore: "require",
      },
    ],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-call": ["off"],
    "@typescript-eslint/no-unsafe-member-access": ["off"],
    "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    "@typescript-eslint/restrict-template-expressions": ["off"],
    "lodash/import-scope": ["error", "full"],
    "lodash/prefer-lodash-method": ["off"],
    "lodash/prefer-constant": ["off"],
  },
  overrides: [
    {
      files: "**/spec/**",
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
      },
    },
  ],
  settings: {
    "import/extensions": [".js", ".jsx", ".ts", ".tsx"],
  },
  ignorePatterns: ["node_modules", "lib", "tmp", "__generated__", ".direnv"],
};

module.exports = config;
