import { request, type FullConfig } from "@playwright/test";

export const E2E_STORAGE_STATE_PATH = "test-results/e2e-storage-state.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright E2E baseURL is missing");

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.get("/api/v1/auth/session");
    if (!response.ok()) {
      throw new Error(`E2E session initialization failed: HTTP ${response.status()}`);
    }
    await context.storageState({ path: E2E_STORAGE_STATE_PATH });
  } finally {
    await context.dispose();
  }
}
