/** Jest config for the School Pro backend. Run: npm test  (see TESTING.md) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // bcrypt hashing (backup codes, password hashing) is intentionally slow; give the
  // security suites headroom beyond the 5s default.
  testTimeout: 20000,
  setupFiles: ['<rootDir>/src/__tests__/setup-env.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false, isolatedModules: true, tsconfig: { experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, target: 'ES2022', module: 'commonjs' } }],
  },
  clearMocks: true,
};
