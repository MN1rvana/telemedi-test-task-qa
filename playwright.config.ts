import fs from 'node:fs';
import { defineConfig, devices, type Project } from '@playwright/test';

// Credentials live only in .env (see .env.example); on CI they come from real env vars.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

export const AUTH_FILE = 'playwright/.auth/user.json';

// UI mode (`npm test -- --ui`) records a trace of every test it runs, whatever the project says, and a login
// trace would show the password. So there is no setup project in UI mode: tests reuse the last saved session.
const uiMode = process.env.TELEMEDI_UI_MODE === '1';
if (uiMode && !fs.existsSync(AUTH_FILE)) {
  throw new Error('No saved session for UI mode: log in once with "npm test -- --project=setup", then start UI mode again.');
}

const setup: Project = {
  name: 'setup',
  testMatch: /auth\.setup\.ts/,
  // Traces store fill() values and videos show the form, so the login records nothing.
  use: { video: 'off', trace: 'off', screenshot: 'off' },
};

export default defineConfig({
  testDir: './tests',
  // Every test books on the same shared account, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  // A flake must show up, not be retried away.
  retries: 0,
  forbidOnly: !!process.env.CI,
  // The full booking path takes ~20–40 s depending on app load.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://testyautomatyczne.telemedi.com',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...(uiMode ? [] : [setup]),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: uiMode ? [] : ['setup'],
    },
  ],
});
