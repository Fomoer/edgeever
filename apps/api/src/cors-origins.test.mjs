import { describe, expect, test } from "bun:test";
import { DESKTOP_APP_ORIGIN } from "../../desktop/src/main/app-protocol.mjs";
import { fetchEdgeEverApp } from "./index";

const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

const corsRequest = (origin, { method = "GET", path = "/api/release" } = {}) => {
  const headers = { Origin: origin };
  if (method === "OPTIONS") {
    headers["Access-Control-Request-Method"] = "GET";
    headers["Access-Control-Request-Headers"] = "authorization,content-type";
  }
  return fetchEdgeEverApp(
    new Request(`https://notes.example.com${path}`, { method, headers }),
    {},
    executionContext,
  );
};

describe("API CORS origins", () => {
  test("allows the packaged desktop renderer origin on credentialed API requests", async () => {
    const response = await corsRequest(DESKTOP_APP_ORIGIN);

    expect(DESKTOP_APP_ORIGIN).toBe("edgeever-app://app");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_APP_ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("answers a desktop preflight without omitting Access-Control-Allow-Origin", async () => {
    const response = await corsRequest(DESKTOP_APP_ORIGIN, { method: "OPTIONS", path: "/api/v1/auth/session" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP_APP_ORIGIN);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("keeps local Vite and legacy file renderer origins working", async () => {
    for (const origin of ["http://127.0.0.1:5173", "http://localhost:5173", "null"]) {
      const response = await corsRequest(origin);
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });

  test("does not reflect arbitrary website origins", async () => {
    const response = await corsRequest("https://evil.example");

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
