import { defineConfig, devices } from "@playwright/test";

// Configuración básica: un solo proyecto (Chromium) para empezar, el
// servidor de desarrollo se levanta solo si no hay uno ya corriendo
// (reuseExistingServer) -- así "npx playwright test" funciona igual con
// `npm run dev` ya abierto en otra terminal que sin él.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
