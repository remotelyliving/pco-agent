/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.test.ts',
    '!src/lib/**/*.spec.ts',
  ],
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  reporters: ['clear-text', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
  tempDirName: '.stryker-tmp',
};
