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
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'pwa-manifest-icon.svg'],
        manifest: {
          name: 'Liam AI English',
          short_name: 'Liam AI',
          description: 'Seu professor de inglês com IA 24h por dia',
          theme_color: '#040D1C',
          background_color: '#040D1C',
          display: 'standalone',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'firebase-cache',
              },
            },
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'gemini-cache',
              },
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
