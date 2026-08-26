import { defineConfig as viteDefineConfig, loadEnv, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default viteDefineConfig(({ command, mode }) => {
  const plugins = [];

  // TanStack devtools in development only
  if (mode === "development") {
    import("@tanstack/devtools-vite").then(({ devtools }) => {
      // devtools is added dynamically during dev
    });
  }

  // Core plugins
  plugins.push(tailwindcss());
  plugins.push(tsconfigPaths({ projects: ["./tsconfig.json"] }));

  // TanStack Start with server import protection
  plugins.push(
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      server: { entry: "server" },
    }),
  );

  // Nitro for production builds (Cloudflare Module target)
  if (command === "build") {
    plugins.push(
      nitro({
        defaultPreset: "cloudflare-module",
      }),
    );
  }

  // React plugin
  plugins.push(react());

  // Load VITE_* env variables
  const loadedEnv = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadedEnv)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: {
      host: "localhost",
      port: 8080,
    },
    plugins,
  };
});
