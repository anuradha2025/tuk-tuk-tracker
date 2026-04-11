export default {
  // Use Node's built-in experimental VM modules to support ESM
  testEnvironment: "node",
  transform: {},

  // Give each test file a generous timeout (DB operations can be slow)
  testTimeout: 30000,

  // Only run files in the tests/ directory
  testMatch: ["**/tests/**/*.test.js"],

  // Show a coverage summary after each run
  collectCoverageFrom: [
    "src/**/*.js",
    "server.js",
    "!src/config/swagger.js",
  ],
};
