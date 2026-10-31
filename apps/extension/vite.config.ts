import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build as buildStandaloneScript } from "esbuild";
import { defaultClientConditions, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import extensionPackage from "./package.json";
import { buildExtensionManifest, type ExtensionTarget } from "./manifest";

const target: ExtensionTarget = process.env.EDGE_EVER_EXTENSION_TARGET === "firefox"
  ? "firefox"
  : "chromium";
const require = createRequire(import.meta.url);

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { conditions: ["worker", ...defaultClientConditions], alias: { "@": fileURLToPath(new URL("../web/src", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "edgeever-extension-manifest",
      async generateBundle(_options, bundle) {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: `${JSON.stringify(buildExtensionManifest(target, extensionPackage.version), null, 2)}\n`,
        });

        // chrome.scripting.executeScript({ files }) loads classic scripts, so
        // capture must not inherit Vite's shared ESM chunks.
        for (const name of ["capture", "capture-platform", "social-target"]) {
          const capture = await buildStandaloneScript({
            entryPoints: [fileURLToPath(new URL(`./src/${name}.ts`, import.meta.url))],
            outfile: `${name}.js`,
            bundle: true,
            format: "iife",
            platform: "browser",
            target: "es2022",
            minify: true,
            write: false,
          });
          this.emitFile({
            type: "asset",
            fileName: `assets/${name}.js`,
            source: capture.outputFiles[0].contents,
          });
        }
        // Reuse the generated Tailwind stylesheet so the shadcn component and
        // its theme tokens behave identically in pages and in the shadow root.
        const themeStyles = Object.values(bundle)
          .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
          .map((item) => item.type === "asset" ? typeof item.source === "string" ? item.source : new TextDecoder().decode(item.source) : "")
          .join("\n");
        if (!themeStyles) throw new Error("Missing compiled extension theme for shadow notifications");
        const region = await buildStandaloneScript({
          entryPoints: [fileURLToPath(new URL("./src/region-clip.ts", import.meta.url))],
          bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, write: false,
          jsx: "automatic",
          define: { "process.env.NODE_ENV": '"production"', __CLIP_REGION_CSS__: JSON.stringify(themeStyles) },
          legalComments: "eof",
        });
        this.emitFile({ type: "asset", fileName: "assets/region-clip.js", source: region.outputFiles[0].contents });
        this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES.txt", source: await readFile(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url), "utf8") });
        const feedback = await buildStandaloneScript({
          entryPoints: [fileURLToPath(new URL("./src/ui/clip-feedback.tsx", import.meta.url))],
          bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true, write: false,
          jsx: "automatic",
          define: {
            "process.env.NODE_ENV": '"production"',
            __CLIP_FEEDBACK_CSS__: JSON.stringify(`${await readFile(require.resolve("sonner/dist/styles.css"), "utf8")}\n${themeStyles}`),
          },
          plugins: [{
            name: "shadow-only-sonner-styles",
            setup(build) {
              build.onLoad({ filter: /sonner[\\/]dist[\\/]index\.(mjs|js)$/ }, async ({ path }) => {
                // Sonner's default module injects CSS into document.head. The
                // same published stylesheet is instead mounted in our shadow.
                const source = await readFile(path, "utf8");
                const contents = source.replace(/__insertCSS\("(?:\\.|[^"\\])*"\);/g, "");
                if (contents === source) throw new Error("Sonner CSS injection changed; review shadow isolation before upgrading");
                return { contents, loader: "js" };
              });
            },
          }],
        });
        this.emitFile({ type: "asset", fileName: "assets/clip-feedback.js", source: feedback.outputFiles[0].contents });
      },
    },
  ],
  build: {
    outDir: target === "firefox" ? "dist-firefox" : "dist",
    emptyOutDir: true,
    // Chromium cannot reuse these extension-page preloads across worlds.
    // Load the local chunks through their regular module imports instead.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL("./popup.html", import.meta.url)),
        options: fileURLToPath(new URL("./options.html", import.meta.url)),
        "image-save": fileURLToPath(new URL("./image-save.html", import.meta.url)),
        "tweet-save": fileURLToPath(new URL("./tweet-save.html", import.meta.url)),
        "xhs-save": fileURLToPath(new URL("./xhs-save.html", import.meta.url)),
        "zhihu-save": fileURLToPath(new URL("./zhihu-save.html", import.meta.url)),
        background: fileURLToPath(new URL("./src/background.ts", import.meta.url)),
        "capture-image": fileURLToPath(new URL("./src/capture-image.ts", import.meta.url)),
        "capture-tweet": fileURLToPath(new URL("./src/capture-tweet.ts", import.meta.url)),
        "capture-github": fileURLToPath(new URL("./src/capture-github.ts", import.meta.url)),
        "capture-xhs": fileURLToPath(new URL("./src/capture-xhs.ts", import.meta.url)),
        "capture-zhihu": fileURLToPath(new URL("./src/capture-zhihu.ts", import.meta.url)),
        "capture-reddit": fileURLToPath(new URL("./src/capture-reddit.ts", import.meta.url)),
        "tweet-target": fileURLToPath(new URL("./src/tweet-target.ts", import.meta.url)),
        "xhs-target": fileURLToPath(new URL("./src/xhs-target.ts", import.meta.url)),
        "zhihu-target": fileURLToPath(new URL("./src/zhihu-target.ts", import.meta.url)),
        "reddit-target": fileURLToPath(new URL("./src/reddit-target.ts", import.meta.url)),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
