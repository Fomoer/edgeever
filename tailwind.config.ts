import type { Config } from "tailwindcss";
import webConfig from "./apps/web/tailwind.config.ts";

export default {
  ...webConfig,
  content: ["./apps/web/index.html", "./apps/web/src/**/*.{ts,tsx}"],
} satisfies Config;
