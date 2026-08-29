import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { registerSW } from "virtual:pwa-register";

// Registrazione a mano del Service Worker (vedi vite.config.js,
// injectRegister:false) — quella iniettata di default lo registra una
// volta al primo caricamento e non ricontrolla mai più. Il problema reale:
// su iOS, riaprire l'app dalla schermata Home spesso *riprende* il processo
// sospeso invece di ricaricare davvero la pagina, quindi il controllo
// "c'è una versione nuova?" non scatta da solo — l'app può restare bloccata
// su una versione vecchia per giorni, e non è ragionevole chiedere a ogni
// atleta di svuotare la cache manualmente ogni volta.
// Ricontrolliamo esplicitamente: quando l'app torna visibile (il caso reale
// "la riapro dalla Home") e periodicamente mentre resta aperta. Se c'è
// un aggiornamento, "autoUpdate" lo installa da solo; ricarichiamo la
// pagina quando il nuovo Service Worker prende il controllo, altrimenti il
// codice nuovo sarebbe pronto ma la pagina già in memoria resterebbe quella
// vecchia finché non viene ricaricata comunque.
if ("serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const checkForUpdate = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      setInterval(checkForUpdate, 30 * 60 * 1000); // ogni 30 minuti, finché l'app resta aperta
    },
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
