import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // solo service worker + cache: il manifest (nome/icona "salva su
      // home") è già gestito a mano in public/manifest.json + index.html,
      // non serve che il plugin lo generi anche lui.
      manifest: false,
      registerType: "autoUpdate", // niente versioni vecchie dell'app bloccate in cache dopo un deploy
      workbox: {
        // oltre ai file dell'app (JS/CSS/HTML, precache di default): le GIF
        // esercizio, cache-first e a lungo termine — la prima volta che si
        // vede un esercizio scarica, le volte dopo è istantaneo (anche
        // offline). Copre sia il nostro Supabase Storage sia gli eventuali
        // link Google Drive/Photos ancora in uso.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              (url.hostname.endsWith(".supabase.co") && url.pathname.includes("/exercise-gifs/")) ||
              url.hostname === "lh3.googleusercontent.com",
            handler: "CacheFirst",
            options: {
              cacheName: "exercise-gifs",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 }, // 60 giorni
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
