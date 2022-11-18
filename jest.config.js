// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

/** @type {import('@jest/types').Config.InitialOptions} */
const config = {
  // A map from regular expressions to paths to transformers.
  transform: { "^.+\\.[jt]sx?$": ["@swc/jest"] },

  // An array of regexp pattern strings that are matched against all test paths before executing the test.
  // If the test path matches any of the patterns, it will be skipped.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/lib/", "<rootDir>/tmp/"],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test file in the suite is executed.
  setupFilesAfterEnv: ["jest-extended/all", "<rootDir>/spec/jest.setup.ts"],
};

module.exports = config;
