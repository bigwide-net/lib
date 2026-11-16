// One project per library, all in jsdom.
const transform = { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true, isolatedModules: true } }] };
const project = (name, testMatch, extra = {}) => ({ displayName: name, testEnvironment: 'jsdom', testMatch: [`<rootDir>/${name}/${testMatch}`], transform, ...extra });

module.exports = {
  projects: [
    project('postviewer', 'src/**/*.test.ts'),
    project('socialspec', 'test/**/*.test.ts', { setupFiles: ['<rootDir>/socialspec/test/setup.ts'] }),
    project('follow', 'test/**/*.test.ts'),
  ],
};
