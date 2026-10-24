import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3001',
    viewport: { width: 390, height: 844 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 5'] } }],
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
  },
});
