import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") && !process.env[key]) {
      process.env[key] = env[key];
    }
  }

  return {
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        customViteReactPlugin: true,
      }),
      viteReact(),
    ],
    server: {
      host: true,
      port: 5173,
    },
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "@tanstack/react-router",
        "@tanstack/react-start",
      ],
    },
  };
});
