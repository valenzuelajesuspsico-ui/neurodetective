import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Ruta base para GitHub Pages de proyecto: https://<usuario>.github.io/neurodetective/
// Se puede sobreescribir con la variable de entorno BASE_PATH (p. ej. "/" para dominio propio).
const base = process.env.BASE_PATH || "/neurodetective/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "NeuroDetective RDoC",
        short_name: "NeuroDetective",
        description: "Juego educativo de razonamiento clínico basado en el marco RDoC.",
        lang: "es",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
    }),
  ],
});
