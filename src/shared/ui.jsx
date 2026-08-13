import { useRef } from "react";

// ---------------------------------------------------------------------------
// Pezzi condivisi da tutta l'app: stile visuale, placeholder GIF, id locali.
// ---------------------------------------------------------------------------

export const uid = () => Math.random().toString(36).slice(2, 9);

// attrezzatura di un esercizio (bodyweight = corpo libero, niente carico da
// prescrivere/mostrare)
export const EQUIPMENT_LABELS = { bodyweight: "Corpo libero", db1: "1 manubrio", db2: "2 manubri", kb: "Kettlebell", bb: "Bilanciere", band: "Elastico" };

// livello di carico da usare, PRESCRITTO dall'admin in fase di creazione (non
// più chiesto all'atleta a fine esercizio): stessa scala per tutti gli
// esercizi con attrezzo, mostrata all'atleta insieme a nome/rep.
export const LOAD_LEVELS = ["Molto leggero", "Leggero", "Moderato", "Pesante", "Molto pesante"];

// font dei nomi esercizio (condensato, bold, tutto maiuscolo): Gotham
// Condensed Bold è un font commerciale, non incorporabile gratuitamente —
// Oswald è la sua alternativa libera più diffusa, caricata in index.html.
export const EXERCISE_NAME_FONT = { fontFamily: '"Oswald", "Arial Narrow", sans-serif', fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 };

export const PLACEHOLDER_GIF =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='#1a1a1a'/><text x='50%' y='48%' fill='#666' font-family='sans-serif' font-size='16' text-anchor='middle'>GIF esercizio</text><text x='50%' y='58%' fill='#444' font-family='sans-serif' font-size='12' text-anchor='middle'>incolla URL</text></svg>`
  );

// <img> per le GIF esercizio: caricamento lazy + niente referrer (i link Google
// Drive/Photos a volte rifiutano la richiesta in base al referrer) + un retry
// automatico prima di arrendersi al placeholder — i link lh3.googleusercontent.com
// falliscono a volte in modo transitorio, specie quando ne carichi tanti insieme.
// fetchPriority: "high" per quella davvero a schermo ora (es. il video del
// Player) — così non aspetta mai dietro alle GIF pre-caricate in background
// per i prossimi esercizi (vedi prefetchGifs più sotto).
export function ExGif({ src, alt, style, onClick, fetchPriority }) {
  const retries = useRef(0);
  const handleError = (e) => {
    const img = e.currentTarget;
    if (src && retries.current < 2) {
      retries.current += 1;
      const busted = src + (src.includes("?") ? "&" : "?") + "_r=" + retries.current;
      setTimeout(() => { img.src = busted; }, 500 * retries.current);
    } else {
      img.onerror = null;
      img.src = PLACEHOLDER_GIF;
    }
  };
  return (
    <img src={src || PLACEHOLDER_GIF} alt={alt} style={style} onClick={onClick}
      loading="lazy" referrerPolicy="no-referrer" onError={handleError} fetchPriority={fetchPriority || "auto"} />
  );
}

// pre-scarica GIF in background, senza mostrarle: le fa finire nella cache
// del browser (e nel Service Worker, se attivo) prima che l'atleta arrivi
// davvero a quell'esercizio — usato per avere pronto il prossimo allenamento
// invece di scaricare esercizio per esercizio durante l'allenamento stesso.
// priority: "low" di default (di proposito — non deve mai competere con una
// GIF che serve ORA, tipo il video in corso nel Player, che chiede "high"
// tramite ExGif) — passa "high" solo per le prime, più urgenti da avere pronte.
// Un errore su una singola GIF (link rotto) non deve fermare le altre.
export function prefetchGifs(urls, priority = "low") {
  urls.filter(Boolean).forEach((url) => {
    const img = new Image();
    img.onerror = () => {}; // silenzioso: se fallisce qui, ExGif riproverà comunque quando servirà davvero
    img.fetchPriority = priority;
    img.src = url;
  });
}

export const globalCss = `
* { box-sizing: border-box; }
body { margin: 0; background: #0d0d0d; }
input, textarea, select { outline: none; font-family: inherit; color: inherit; }
button { cursor: pointer; font-family: inherit; color: inherit; }
button:disabled { opacity: .3; cursor: not-allowed; }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
`;

export const S = {
  app: { minHeight: "100vh", background: "#0d0d0d", color: "#f2f2f2", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #1f1f1f", position: "sticky", top: 0, background: "#0d0d0d", zIndex: 10 },
  // logo Viltrum Fitness (public/logo.png): simbolo quadrato (non un
  // wordmark) — "small" nell'header, accanto al nome scritto a parte;
  // "big" nelle schermate di apertura (login, pagina iniziale, avvio Player).
  logoImgSmall: { width: 36, height: 36, objectFit: "cover", borderRadius: 9, display: "block", flexShrink: 0 },
  logoImgBig: { width: 64, height: 64, objectFit: "cover", borderRadius: 16, display: "block", margin: "0 auto 14px" },
  logoText: { fontWeight: 800, letterSpacing: 1, fontSize: 15 },
  logoSub: { fontSize: 11, color: "#888", letterSpacing: .5 },
  main: { maxWidth: 760, margin: "0 auto", padding: "22px 18px 60px" },
  h2: { fontSize: 20, fontWeight: 700, margin: 0 },
  muted: { color: "#888", fontSize: 13 },
  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" },

  primaryBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#C1FF72", color: "#0d0d0d", border: "none", padding: "9px 16px", borderRadius: 9, fontWeight: 600, fontSize: 14 },
  primaryBtnLg: { display: "inline-flex", alignItems: "center", gap: 8, background: "#C1FF72", color: "#0d0d0d", border: "none", padding: "12px 22px", borderRadius: 11, fontWeight: 700, fontSize: 16 },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", color: "#bbb", border: "1px solid #333", padding: "7px 12px", borderRadius: 8, fontSize: 13 },
  iconBtn: { display: "inline-grid", placeItems: "center", background: "#1a1a1a", color: "#ccc", border: "1px solid #2a2a2a", width: 36, height: 36, borderRadius: 8 },
  iconBtnSm: { display: "inline-grid", placeItems: "center", background: "#1a1a1a", color: "#ccc", border: "1px solid #2a2a2a", width: 30, height: 30, borderRadius: 7 },
  dashedBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#aaa", border: "1px dashed #3a3a3a", padding: "10px 16px", borderRadius: 9, fontSize: 13, width: "100%", justifyContent: "center", marginTop: 10 },

  cardGrid: { display: "flex", flexDirection: "column", gap: 12 },
  card: { display: "flex", alignItems: "center", gap: 14, background: "#151515", border: "1px solid #232323", borderRadius: 13, padding: "16px 18px", flexWrap: "wrap" },
  cardTitle: { fontWeight: 700, fontSize: 16, marginBottom: 6 },
  cardMeta: { display: "flex", gap: 14, flexWrap: "wrap", color: "#888", fontSize: 12.5 },
  cardActions: { display: "flex", gap: 8, alignItems: "center" },

  searchRow: { display: "flex", alignItems: "center", gap: 8, background: "#151515", border: "1px solid #232323", borderRadius: 10, padding: "9px 14px", marginBottom: 16 },
  searchInput: { flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: 14 },
  // lista (non griglia): niente GIF in anteprima qui — 237 GIF animate
  // insieme appesantivano il PC. Si vede la GIF solo aprendo la scheda
  // (click sulla riga), un esercizio alla volta — vedi LibraryView.
  libGrid: { display: "flex", flexDirection: "column", gap: 8 },
  libCard: { display: "flex", alignItems: "center", gap: 10, background: "#151515", border: "1px solid #232323", borderRadius: 12, padding: "10px 12px", cursor: "pointer" },
  libInfo: { flex: 1, minWidth: 0 },
  libName: { ...EXERCISE_NAME_FONT, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  libMeta: { fontSize: 12, color: "#888" },
  libActions: { display: "flex", gap: 6 },

  modalWrap: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 },
  modal: { width: "100%", maxWidth: 420, background: "#161616", border: "1px solid #2a2a2a", borderRadius: 16, padding: 20, maxHeight: "88vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontWeight: 700, fontSize: 16 },
  modalPreview: { width: "100%", height: 150, objectFit: "cover", borderRadius: 10, background: "#000", marginBottom: 14 },
  fieldLbl: { display: "block", fontSize: 12, color: "#999", fontWeight: 600, margin: "10px 0 5px" },
  fieldInput: { width: "100%", background: "#0d0d0d", border: "1px solid #2e2e2e", color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 14 },
  fieldSelect: { width: "100%", background: "#0d0d0d", border: "1px solid #2e2e2e", color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 14 },

  pickerList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" },
  pickerItem: { display: "flex", alignItems: "center", gap: 10, background: "#0f0f0f", border: "1px solid #242424", borderRadius: 10, padding: 8, width: "100%" },
  pickerThumb: { width: 44, height: 44, objectFit: "cover", borderRadius: 7, background: "#000" },

  titleInput: { flex: 1, background: "#151515", border: "1px solid #2a2a2a", color: "#fff", fontSize: 18, fontWeight: 700, padding: "10px 14px", borderRadius: 10 },
  restRow: { display: "flex", alignItems: "center", gap: 10, background: "#151515", border: "1px solid #232323", borderRadius: 11, padding: "12px 16px", marginBottom: 20, fontSize: 14, color: "#ddd" },
  numInput: { width: 70, background: "#0d0d0d", border: "1px solid #333", color: "#fff", padding: "6px 10px", borderRadius: 7, fontSize: 14 },
  numInputSm: { width: 60, background: "#0d0d0d", border: "1px solid #333", color: "#fff", padding: "5px 8px", borderRadius: 7, fontSize: 13, marginTop: 3, display: "block" },

  blockCard: { background: "#141414", border: "1px solid #232323", borderRadius: 13, padding: 16, marginBottom: 16 },
  blockHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  blockLabel: { fontWeight: 800, fontSize: 12, letterSpacing: 1, color: "#C1FF72" },
  exRow: { display: "flex", gap: 12, alignItems: "center", background: "#0f0f0f", border: "1px solid #222", borderRadius: 10, padding: 10, marginBottom: 10 },
  exThumb: { width: 56, height: 56, objectFit: "cover", borderRadius: 8, background: "#000", flexShrink: 0 },
  exFields: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  exNameStatic: { ...EXERCISE_NAME_FONT, fontSize: 15 },
  exNums: { display: "flex", gap: 14 },
  miniLbl: { fontSize: 11, color: "#888", fontWeight: 600 },

  previewBlockLabel: { fontWeight: 800, fontSize: 12, letterSpacing: 1, color: "#C1FF72", marginBottom: 10 },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 },
  previewCard: { background: "#151515", border: "1px solid #232323", borderRadius: 12, overflow: "hidden" },
  previewImg: { width: "100%", height: 120, objectFit: "cover", background: "#000", display: "block" },
  previewInfo: { padding: "10px 12px" },
  previewName: { ...EXERCISE_NAME_FONT, fontSize: 14, marginBottom: 3 },
  previewMeta: { fontSize: 12, color: "#888" },
  restPill: { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "#12233b", color: "#7fb0ff", border: "1px solid #234", padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600 },

  // è un overlay a schermo intero fuori da S.app: senza queste due righe non
  // eredita colore/font di default e il testo senza un color proprio (es.
  // startTitle) cade sul nero/serif di default del browser, illeggibile sul
  // fondo scuro — vedi startCard più sotto.
  playerFull: { position: "fixed", inset: 0, background: "#000", zIndex: 200, display: "grid", placeItems: "center", overflow: "hidden", color: "#f2f2f2", fontFamily: "system-ui, -apple-system, sans-serif" },
  startCard: { background: "#151515", border: "1px solid #232323", borderRadius: 18, padding: "40px 28px", width: "min(92vw, 420px)", textAlign: "center" },
  startTitle: { fontSize: 24, fontWeight: 800, marginBottom: 6 },
  startMeta: { color: "#888", fontSize: 14, marginBottom: 26 },
  startBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: "#C1FF72", color: "#0d0d0d", border: "none", padding: "15px 30px", borderRadius: 12, fontWeight: 700, fontSize: 17, marginBottom: 14, width: "100%", justifyContent: "center" },

  // ---- stage a schermo intero (GIF di sfondo + overlay) ----
  stageWrap: { position: "absolute", inset: 0 },
  stageMedia: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#111" },
  stageScrimTop: { position: "absolute", top: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(to bottom, rgba(0,0,0,.7), rgba(0,0,0,0))", pointerEvents: "none" },
  stageScrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: "48%", background: "linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,0))", pointerEvents: "none" },

  stageTopArea: { position: "absolute", top: 0, left: 0, right: 0, padding: "max(16px, env(safe-area-inset-top)) 16px 0", display: "flex", flexDirection: "column", gap: 14, zIndex: 3 },
  stageTopRow: { display: "flex", alignItems: "center" },
  stepDots: { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", background: "rgba(0,0,0,.4)", padding: "7px 10px", borderRadius: 20, backdropFilter: "blur(4px)" },
  dot: { height: 6, borderRadius: 3, transition: "background .3s" },
  exitBtnOverlay: { display: "inline-grid", placeItems: "center", width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", backdropFilter: "blur(4px)", flexShrink: 0 },

  stageNameRow: { textAlign: "center", padding: "0 12px" },
  stageTimerRow: { display: "flex", alignItems: "center", gap: 14 },
  exBlockTag: { fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: "#0d0d0d", background: "rgba(193,255,114,.9)", padding: "5px 12px", borderRadius: 20 },
  exStageName: { ...EXERCISE_NAME_FONT, fontSize: "clamp(22px, 6vw, 34px)", color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,.85)", lineHeight: 1.15 },
  exStageReps: { fontSize: 16, color: "#C1FF72", fontWeight: 700, textShadow: "0 2px 10px rgba(0,0,0,.85)" },
  restBig: { fontSize: "clamp(28px, 8vw, 42px)", fontWeight: 900, letterSpacing: 3, color: "#7fb0ff", textShadow: "0 2px 16px rgba(0,0,0,.85)" },
  restSub: { color: "#cdddf5", fontSize: 15, textShadow: "0 2px 10px rgba(0,0,0,.85)" },

  timerBackdrop: { width: 84, height: 84, borderRadius: "50%", background: "rgba(0,0,0,.45)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", boxShadow: "0 8px 30px rgba(0,0,0,.5)", flexShrink: 0 },

  stageBottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px max(20px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 3 },
  controls: { display: "flex", alignItems: "center", justifyContent: "center", gap: 20 },
  ctrlBtn: { display: "grid", placeItems: "center", width: 54, height: 54, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", backdropFilter: "blur(4px)" },
  ctrlBtnMain: { display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: "50%", background: "#C1FF72", border: "none", color: "#0d0d0d" },
  playerFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 380 },
  footBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", color: "#ccc", border: "none", fontSize: 13, textShadow: "0 1px 6px rgba(0,0,0,.8)" },
  stepCount: { color: "#ccc", fontSize: 13, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,.8)" },

  // ---- auth / questionario / pannello atleti (nuovi, stesso linguaggio visuale) ----
  authWrap: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 },
  authCard: { width: "100%", maxWidth: 380, background: "#151515", border: "1px solid #232323", borderRadius: 16, padding: 28 },
  authTitle: { fontSize: 20, fontWeight: 800, marginBottom: 4, textAlign: "center" },
  authSub: { color: "#888", fontSize: 13, textAlign: "center", marginBottom: 22 },
  authError: { color: "#f87171", fontSize: 13, marginTop: 10, textAlign: "center" },
  authNote: { color: "#4ade80", fontSize: 13, marginTop: 10, textAlign: "center" },
  formGap: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 },

  waitCard: { background: "#151515", border: "1px solid #232323", borderRadius: 16, padding: "36px 24px", textAlign: "center", marginTop: 30 },

  navTabs: { display: "flex", gap: 8 },
  navTab: { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#bbb", border: "1px solid #333", padding: "7px 12px", borderRadius: 8, fontSize: 13 },
  navTabActive: { background: "#C1FF72", color: "#0d0d0d", border: "1px solid #C1FF72" },

  // ---- pagina iniziale atleta (dopo il login, prima di questionario/menu) ----
  landingHero: { background: "#151515", border: "1px solid #232323", borderRadius: 18, padding: "36px 24px", textAlign: "center", marginBottom: 16 },
  landingTitle: { fontSize: 22, fontWeight: 800, marginBottom: 20 },
  instructionsCard: { background: "#101820", border: "1px solid #1f2e3a", borderRadius: 14, padding: "16px 18px", marginBottom: 16 },
  instructionsText: { color: "#bcd3e8", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: "6px 0 0" },
  whatsappBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#25D366", color: "#0d0d0d", border: "none", padding: "13px 22px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", width: "100%" },

  athleteList: { display: "flex", flexDirection: "column", gap: 10 },
  athleteCard: { background: "#151515", border: "1px solid #232323", borderRadius: 13, padding: "16px 18px" },
  athleteHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10, flexWrap: "wrap" },
  athleteName: { fontWeight: 700, fontSize: 15 },
  athleteEmail: { color: "#888", fontSize: 12.5 },
  qGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12, fontSize: 12.5 },
  qLabel: { color: "#777", fontWeight: 600 },
  qValue: { color: "#ddd" },
  assignRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  badge: { display: "inline-flex", alignItems: "center", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20 },
  badgeWaiting: { background: "#3b2a12", color: "#f0b155" },
  badgeAssigned: { background: "#12331f", color: "#5fd88f" },
};
