import { describe, expect, test } from "bun:test";
import {
  downloadGithubReleaseAsset,
  downloadGithubReleaseAssetByTag,
  readGithubLatestReleaseManifestText,
  readGithubReleaseByTag,
  readGithubRepositoryManifestText,
} from "./plugin-distribution-routes.ts";

describe("GitHub plugin release asset proxy", () => {
  test("downloads a supported release asset on the server", async () => {
    const calls = [];
    const buffer = await downloadGithubReleaseAsset({
      owner: "example",
      repository: "edgeever-plugin",
      assetId: "42",
      assetName: "main.js",
      request: async (input) => {
        calls.push(String(input));
        return new Response("export default {};", { headers: { "content-length": "18" } });
      },
    });

    expect(new TextDecoder().decode(buffer)).toBe("export default {};");
    expect(calls).toEqual(["https://api.github.com/repos/example/edgeever-plugin/releases/assets/42"]);
  });

  test("rejects an oversized release asset", async () => {
    await expect(downloadGithubReleaseAsset({
      owner: "example",
      repository: "edgeever-plugin",
      assetId: "42",
      assetName: "manifest.json",
      request: async () => new Response("", { headers: { "content-length": String(300 * 1024) } }),
    })).rejects.toThrow("exceeds the allowed package size");
  });

  test("downloads a public release asset without consuming the GitHub REST API quota", async () => {
    const calls = [];
    const buffer = await downloadGithubReleaseAssetByTag({
      owner: "example",
      repository: "edgeever-plugin",
      releaseTag: "v1.2.3-preview.1",
      assetName: "main.js",
      request: async (input) => {
        calls.push(String(input));
        return new Response("export default {};", { headers: { "content-length": "18" } });
      },
    });

    expect(new TextDecoder().decode(buffer)).toBe("export default {};");
    expect(calls).toEqual([
      "https://github.com/example/edgeever-plugin/releases/download/v1.2.3-preview.1/main.js",
    ]);
  });

  test("falls back to the GitHub API asset endpoint when the public download URL fails", async () => {
    const calls = [];
    const buffer = await downloadGithubReleaseAssetByTag({
      owner: "example",
      repository: "edgeever-plugin",
      releaseTag: "v1.2.3",
      assetName: "main.js",
      request: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/releases/download/")) throw new TypeError("Failed to fetch");
        if (url.includes("/releases/tags/")) {
          return Response.json({
            tag_name: "v1.2.3",
            draft: false,
            assets: [{
              id: 42,
              name: "main.js",
              size: 18,
              url: "https://api.github.com/repos/example/edgeever-plugin/releases/assets/42",
              browser_download_url: "https://github.com/example/edgeever-plugin/releases/download/v1.2.3/main.js",
            }],
          });
        }
        if (url.endsWith("/releases/assets/42")) {
          return new Response("export default {};", { headers: { "content-length": "18" } });
        }
        throw new Error(url);
      },
    });

    expect(new TextDecoder().decode(buffer)).toBe("export default {};");
    expect(calls[0]).toBe("https://github.com/example/edgeever-plugin/releases/download/v1.2.3/main.js");
    expect(calls).toContain("https://api.github.com/repos/example/edgeever-plugin/releases/assets/42");
  });

  test("rejects release coordinates that could escape the GitHub download path", async () => {
    await expect(downloadGithubReleaseAssetByTag({
      owner: "example",
      repository: "edgeever-plugin",
      releaseTag: "../../latest",
      assetName: "main.js",
      request: async () => new Response("should not be fetched"),
    })).rejects.toThrow("Invalid GitHub release coordinates");

    await expect(downloadGithubReleaseAssetByTag({
      owner: "example",
      repository: "..",
      releaseTag: "v1.2.3",
      assetName: "main.js",
      request: async () => new Response("should not be fetched"),
    })).rejects.toThrow("Invalid GitHub release coordinates");
  });

  test("lists a release from the public download URL when the GitHub REST API rate-limits the instance", async () => {
    const calls = [];
    const release = await readGithubReleaseByTag({
      owner: "example",
      repository: "edgeever-plugin",
      releaseTag: "v1.2.3",
      request: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("api.github.com")) return new Response("rate limited", { status: 403 });
        if (url === "https://github.com/example/edgeever-plugin/releases/download/v1.2.3/manifest.json") {
          return new Response("{\"version\":\"1.2.3\"}");
        }
        return new Response("missing", { status: 404 });
      },
    });
    expect(release.tag_name).toBe("v1.2.3");
    expect(release.assets.map((asset) => asset.name)).toEqual(["manifest.json", "main.js", "styles.css"]);
    expect(calls[0]).toContain("/releases/tags/v1.2.3");
    expect(calls).toContain("https://github.com/example/edgeever-plugin/releases/download/v1.2.3/manifest.json");
  });

  test("falls back to raw.githubusercontent.com when the GitHub REST API rate-limits the instance", async () => {
    const calls = [];
    const text = await readGithubRepositoryManifestText({
      owner: "example",
      repository: "edgeever-plugin",
      request: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("api.github.com")) return new Response("rate limited", { status: 403 });
        if (url === "https://raw.githubusercontent.com/example/edgeever-plugin/HEAD/manifest.json") {
          return new Response("{\"version\":\"0.4.1\"}");
        }
        return new Response("missing", { status: 404 });
      },
    });
    expect(text).toBe("{\"version\":\"0.4.1\"}");
    expect(calls[0]).toContain("/contents/manifest.json");
    expect(calls).toContain("https://raw.githubusercontent.com/example/edgeever-plugin/HEAD/manifest.json");
  });

  test("reads the latest GitHub Release manifest without using the REST API", async () => {
    const calls = [];
    const text = await readGithubLatestReleaseManifestText({
      owner: "example",
      repository: "edgeever-plugin",
      request: async (input) => {
        calls.push(String(input));
        if (String(input).endsWith("/releases/latest/download/manifest.json")) {
          return new Response("{\"version\":\"0.4.1\"}");
        }
        throw new Error(String(input));
      },
    });
    expect(text).toBe("{\"version\":\"0.4.1\"}");
    expect(calls).toEqual([
      "https://github.com/example/edgeever-plugin/releases/latest/download/manifest.json",
    ]);
  });

  test("falls back to the latest-release API when the public download URL fails", async () => {
    const calls = [];
    const text = await readGithubLatestReleaseManifestText({
      owner: "example",
      repository: "edgeever-plugin",
      request: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/releases/latest/download/manifest.json")) {
          return new Response("missing", { status: 404 });
        }
        if (url.endsWith("/releases/latest")) {
          return Response.json({ tag_name: "v0.4.1" });
        }
        if (url.endsWith("/releases/download/v0.4.1/manifest.json")) {
          return new Response("{\"version\":\"0.4.1\"}", { headers: { "content-length": "19" } });
        }
        throw new Error(url);
      },
    });
    expect(text).toBe("{\"version\":\"0.4.1\"}");
    expect(calls[0]).toBe("https://github.com/example/edgeever-plugin/releases/latest/download/manifest.json");
    expect(calls).toContain("https://api.github.com/repos/example/edgeever-plugin/releases/latest");
  });

  test("falls back to raw.githubusercontent.com when latest-release lookup is rate-limited", async () => {
    const calls = [];
    const text = await readGithubLatestReleaseManifestText({
      owner: "example",
      repository: "edgeever-plugin",
      request: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("api.github.com") || url.includes("/releases/latest/download/")) {
          return new Response("rate limited", { status: 403 });
        }
        if (url === "https://raw.githubusercontent.com/example/edgeever-plugin/HEAD/manifest.json") {
          return new Response("{\"version\":\"0.4.1\"}");
        }
        return new Response("missing", { status: 404 });
      },
    });
    expect(text).toBe("{\"version\":\"0.4.1\"}");
    expect(calls[0]).toBe("https://github.com/example/edgeever-plugin/releases/latest/download/manifest.json");
    expect(calls).toContain("https://raw.githubusercontent.com/example/edgeever-plugin/HEAD/manifest.json");
  });

  test("reads the raw repository manifest for live official plugin resolution", async () => {
    const text = await readGithubRepositoryManifestText({
      owner: "example",
      repository: "edgeever-plugin",
      request: async () => new Response("{\"version\":\"0.5.4\"}", { headers: { "content-length": "20" } }),
    });
    expect(text).toBe("{\"version\":\"0.5.4\"}");
  });

  test("reads a GitHub release by tag without exposing unrelated fields", async () => {
    const release = await readGithubReleaseByTag({
      owner: "example",
      repository: "edgeever-plugin",
      releaseTag: "v0.5.4",
      request: async () => Response.json({
        tag_name: "v0.5.4",
        draft: false,
        extra: "omit",
        assets: [{
          id: 9,
          name: "main.js",
          size: 12,
          url: "https://api.github.com/assets/9",
          browser_download_url: "https://github.com/download/main.js",
          digest: "sha256:abc",
        }],
      }),
    });
    expect(release).toEqual({
      tag_name: "v0.5.4",
      draft: false,
      assets: [{
        id: 9,
        name: "main.js",
        size: 12,
        url: "https://api.github.com/assets/9",
        browser_download_url: "https://github.com/download/main.js",
        digest: "sha256:abc",
      }],
    });
  });
});
