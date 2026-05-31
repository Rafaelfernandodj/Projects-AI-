import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "inline",
        devOptions: {
          enabled: false
        },
        includeAssets: ["pwa-manifest-icon.svg", "pwa-192x192.png", "pwa-512x512.png", "maskable-icon-512x512.png"],
        manifest: {
          name: "Liam",
          short_name: "Liam",
          description: "Professor de inglês com IA",
          theme_color: "#040D1C",
          background_color: "#040D1C",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png"
            },
            {
              src: "/maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable"
            }
          ]
        },
        workbox: {
          inlineWorkboxRuntime: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
          navigateFallbackDenylist: [/^\/api/, /firebase/],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: "NetworkOnly"
            }
          ]
        }
      })
    ],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(
        process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || "",
      ),
      "process.env.API_KEY": JSON.stringify(
        process.env.API_KEY || env.API_KEY || "",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});