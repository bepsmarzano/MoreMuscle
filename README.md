# More Muscle

Web app per creare e somministrare allenamenti con GIF, countdown e annunci vocali. Un admin costruisce tre librerie riusabili — **Riscaldamenti**, **Programmi Forza**, **Programmi Circuito** — e le assegna **separatamente e indipendentemente** a ogni atleta; invita gli atleti via email e le assegnazioni si basano anche su un questionario che l'atleta compila al primo accesso.

## Stack
React 18 + Vite + Supabase (auth + Postgres) + Vercel (deploy + funzione serverless per gli inviti). Service Worker (`vite-plugin-pwa`) per la cache delle GIF esercizio e "salva su home" come app.

## Setup — prima di avviare in locale
1. **Supabase**: hai già un progetto — apri il SQL Editor e incolla/esegui **in ordine**:
   - [`supabase/schema.sql`](supabase/schema.sql) — tabelle base (`profiles`, `library`, `workouts`, `questionnaire_responses`), RLS, trigger.
   - [`supabase/migration_strength_plans.sql`](supabase/migration_strength_plans.sql) — massimali, log allenamento, piani/sessioni (storico: la parte "piani" viene ritirata dalla migration successiva).
   - [`supabase/migration_program_composition.sql`](supabase/migration_program_composition.sql) — Riscaldamenti/Programmi Forza/Programmi Circuito come librerie riusabili, composte nel piano (storico, idem).
   - [`supabase/migration_split_sections.sql`](supabase/migration_split_sections.sql) — ritira il concetto di "Piano": Riscaldamento/Forza/Circuito diventano 3 assegnazioni indipendenti per atleta, ognuna con la propria posizione di avanzamento.
   - [`supabase/migration_warmup_programs.sql`](supabase/migration_warmup_programs.sql) — il Riscaldamento diventa un "Programma" riusabile (sequenza ordinata di sessioni) come Forza/Circuito, assegnato con un solo menu a tendina invece di una rotazione ad-hoc per atleta.
   - [`supabase/migration_app_settings.sql`](supabase/migration_app_settings.sql) — impostazioni globali (testo istruzioni + numero WhatsApp) mostrate nella pagina iniziale dell'atleta.
   - [`supabase/migration_gif_storage.sql`](supabase/migration_gif_storage.sql) — bucket Supabase Storage per le GIF esercizio (al posto degli hotlink a Google Drive/Photos, lenti e non affidabili). Dopo questa, esegui anche lo script di migrazione dati — vedi [Spostare le GIF su Supabase Storage](#spostare-le-gif-su-supabase-storage) più sotto.
   - [`supabase/migration_gif_size_limit.sql`](supabase/migration_gif_size_limit.sql) — alza il limite di dimensione del bucket GIF (informativa: lo script di migrazione lo fa già da solo a ogni run).
   - [`supabase/migration_athlete_profile.sql`](supabase/migration_athlete_profile.sql) — profilo atleta self-service: nome e massimali inseribili dall'atleta stesso, non solo dall'admin.
2. **Variabili d'ambiente**: copia `.env.local.example` in `.env.local` e riempilo con Project URL + anon public key (Supabase → Project Settings → API).
   ```bash
   cp .env.local.example .env.local
   ```
3. **Installa e avvia**:
   ```bash
   npm install
   npm run dev
   ```
   Apri l'URL che stampa Vite (di solito http://localhost:5173).
4. **Crea il tuo account admin** — l'app non ha un modulo di registrazione pubblico (di proposito: gli atleti arrivano solo via invito). Il primissimo utente lo crei dal dashboard Supabase:
   - Authentication → Users → **Add user** → email + password (spunta "Auto Confirm User" se presente, altrimenti dovrai confermare l'email).
   - poi promuoviti ad admin nel SQL Editor:
     ```sql
     update public.profiles set role = 'admin' where email = 'tua-email@esempio.com';
     ```
   - infine fai login nell'app con quell'email/password. Senza il passo di promozione il tuo account resta un "atleta" qualsiasi.

## Ruoli
- **Admin** (tu): Libreria esercizi, Programmi Riscaldamento, Programmi Forza, Programmi Circuito, Atleti (inviti/eliminazione/assegnazione per sezione/massimali/log), Impostazioni (testo istruzioni + numero WhatsApp mostrati all'atleta).
- **Atleta**: al primo accesso, dopo il login, vede una **pagina iniziale** (saluto, pulsante "Vai agli allenamenti", istruzioni brevi, pulsante "Contattami" che apre una chat WhatsApp col tuo numero — tutto configurabile dall'admin in Impostazioni); superata quella, compila un questionario standard (obiettivo, livello, infortuni/limitazioni, giorni disponibili, attrezzatura — modificabile in seguito) e poi vede un menu con **3 sezioni indipendenti** — Riscaldamento, Forza, Circuito — ognuna con la propria "prossima sessione" (o "non assegnato"/"programma completato" se non c'è nulla da fare). Le sezioni avanzano **indipendentemente**: completarne una non tocca le altre due, e finché una sessione non viene portata a termine resta la "prossima" — saltarla oggi significa semplicemente ritrovarla identica la volta dopo. Solo sul **Circuito** c'è un pulsante "Salta per oggi" esplicito (stesso effetto di non farlo: torna al menu senza avanzare). Una sessione già completata **non è ripetibile** (niente "Rifai" nel flusso reale). Dal menu può anche aprire **Profilo**: nome e cognome (prima li impostava solo l'admin all'invito) e i propri massimali — usati per calcolare in automatico il peso di lavoro nella parte di Forza.

Gli atleti **non si autoregistrano**: li inviti tu dal pannello Atleti (email + nome opzionale), Supabase manda l'invito e l'atleta imposta la password al primo accesso tramite quel link.

## Cosa fa
- **Libreria esercizi** — nome, URL GIF, rep e tempo di default, attrezzatura (corpo libero / 1-2 manubri / kettlebell / bilanciere / elastico). Importabile anche da CSV/Google Sheet. Elencata come lista semplice (niente GIF in anteprima nella lista — 237 GIF animate insieme appesantivano il PC): click su una riga apre la scheda di modifica, dove la GIF si vede.
- **Programmi Riscaldamento** — sequenza ordinata di sessioni a corpo libero (N esercizi + round ciascuna), riusabile su più atleti — stessa forma/UX di Forza e Circuito. A differenza loro, un Programma Riscaldamento assegnato **ruota all'infinito** sulle sue sessioni: completata l'ultima si ricomincia dalla prima (non "finisce" mai).
- **Programmi Forza** — sequenza ordinata di sessioni Forza (progressione), riusabile su più atleti. Ogni sessione: un solo esercizio (scelto dalla Libreria), serie di riscaldamento specifico (avvicinamento al peso — reps + nota libera) + serie di lavoro a **percentuale del massimale** dell'atleta (peso calcolato automaticamente, mai a mano), ognuna anche impostabile come **AMRAP**. Il massimale lo inserisce l'**atleta stesso** dal suo Profilo (o tu, dal pannello Atleti) — collegato automaticamente all'esercizio scelto dalla libreria (niente chiave da scrivere a mano: usare lo stesso esercizio in più sessioni/programmi basta a collegarli allo stesso massimale).
- **Programmi Circuito** — sequenza ordinata di sessioni Circuito (progressione); ogni sessione ha **2 blocchi** con un riposo a cronometro tra i due.
- **Assegnazione per atleta** — Riscaldamento, Forza e Circuito si assegnano **separatamente**, ciascuno con un menu a tendina (un Programma solo per sezione), dal pannello Atleti. Ognuna delle 3 sezioni ha la propria posizione di avanzamento: completare la Forza non tocca il Circuito né il Riscaldamento. Forza e Circuito **avanzano e si fermano** all'ultima sessione del programma assegnato (poi mostrano "programma completato"); il Riscaldamento **ruota all'infinito**. Le sessioni non sono righe salvate: si **assemblano al volo** dalla libreria assegnata, alla posizione corrente dell'atleta.
- **Player** — a schermo intero, GIF di sfondo, controlli play/pausa/avanti/indietro, annunci vocali (Web Speech API del browser). Countdown per esercizi/serie; il **riposo tra blocchi è un cronometro che conta in su** (nessun tempo imposto: l'atleta preme avanti quando è pronto, vedendo quanto tempo è passato). Il livello di carico da usare (per esercizi con attrezzo, corpo libero escluso) lo **prescrivi tu** in fase di creazione — l'atleta lo vede a schermo insieme a nome esercizio e ripetizioni, non gli viene chiesto. L'unica cosa ancora annotata dall'atleta durante l'esecuzione: le ripetizioni fatte, a fine di una serie Max/AMRAP.

  Le annotazioni finiscono nello storico consultabile dal pannello Atleti. A fine sessione non c'è "Rifai": una sessione completata fa avanzare la sezione e non è ripetibile (solo il Circuito ha un "Salta per oggi" *prima* di iniziarla, per rimandarla senza segnarla come fatta).
- **Pagina iniziale atleta** — prima schermata a ogni apertura dell'app: saluto, pulsante grande "Vai agli allenamenti" (entra nel resto dell'app), un riquadro con le istruzioni e un pulsante "Contattami" che apre `wa.me/<numero>` in una nuova scheda. Testo e numero si modificano dal tab Impostazioni dell'admin, senza bisogno di deploy. Un pulsante "Home" nel menu allenamenti ci riporta.
- **Profilo atleta** — nome e cognome (prima impostabile solo dall'admin all'invito) e i propri massimali, entrambi self-service. I massimali mostrati sono solo quelli usati dal Programma Forza assegnato in quel momento (niente da indovinare) e vengono usati per calcolare in automatico il peso di lavoro — non serve più che li inserisca l'admin.

## Struttura del codice
```
src/
  lib/        client Supabase + tutte le funzioni di accesso dati (api.js)
  shared/     stile visuale condiviso (S), placeholder GIF, componente ExGif
  player/     Preview + Player (esecuzione sessione, blocchi standard e Forza), usato da admin e atleta
  admin/
    WorkoutBuilder.jsx    guscio admin (nav) + Libreria esercizi
    blockEditors.jsx      editor condivisi: LibraryPicker, StandardBlockEditor, StrengthBlockEditor
    WarmupPrograms.jsx    CRUD programmi Riscaldamento (sequenze di sessioni)
    StrengthPrograms.jsx  CRUD programmi Forza (sequenze di sessioni)
    CircuitPrograms.jsx   CRUD programmi Circuito (sequenze di sessioni)
    AdminAthletes.jsx     inviti, assegnazione per sezione (riscald./forza/circuito), massimali, storico log
    AppSettings.jsx       testo istruzioni + numero WhatsApp mostrati nella pagina iniziale atleta
  athlete/    Questionnaire + Profile (nome + massimali self-service) + AthleteHome (pagina iniziale, poi menu 3 sezioni indipendenti, ciascuna con la propria prossima sessione)
  auth/       AuthProvider (sessione+ruolo), LoginScreen, SetPassword
api/
  invite-athlete.js   funzione serverless Vercel: invita un atleta via email (service role key)
  delete-athlete.js   idem: elimina l'account di un atleta (cascade su profilo/questionario/massimali/log) — utile anche per reinvitare chi non ha mai completato l'accesso, dato che Supabase non invita due volte la stessa email finché l'utente esiste
supabase/
  schema.sql                        da eseguire manualmente nel SQL Editor di Supabase
  migration_strength_plans.sql      idem, dopo schema.sql (storico)
  migration_program_composition.sql idem, dopo le due precedenti (storico)
  migration_split_sections.sql      idem, dopo le tre precedenti — ritira "Piani", 3 sezioni indipendenti
  migration_warmup_programs.sql     idem, dopo la precedente — Riscaldamento come Programma (come Forza/Circuito)
  migration_app_settings.sql        idem, dopo la precedente — impostazioni globali (istruzioni + WhatsApp)
  migration_gif_storage.sql         idem, dopo la precedente — bucket Storage per le GIF esercizio
  migration_gif_size_limit.sql      idem, dopo la precedente — limite dimensione bucket GIF
  migration_athlete_profile.sql     idem, dopo la precedente — profilo atleta self-service (nome + massimali)
scripts/
  migrate-gifs-to-storage.mjs   migrazione una tantum: sposta le GIF da Google Drive a Supabase Storage
```

## Build produzione
```bash
npm run build      # genera /dist
npm run preview    # anteprima del build
```

## Deploy (Vercel)
Serve per far funzionare gli inviti via email (la funzione in `api/invite-athlete.js` non è servita da `vite dev`). Sul progetto Vercel imposta:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — stessi valori di `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` — da Supabase → Project Settings → API → *service_role* (**mai** in `.env.local`, **mai** con prefisso `VITE_`)

Per testare l'invito in locale senza deployare: `vercel dev` (richiede `vercel login` + `vercel env pull`).

[`vercel.json`](vercel.json) fa da "riscrittura" per la SPA: percorsi come `/set-password` esistono solo lato client (gestiti da `App.jsx` in base a `window.location.pathname`, non da un file reale), quindi senza questa regola Vercel risponde con un suo 404 (`NOT_FOUND`) invece di servire l'app — succede tipicamente cliccando il link di un'email di invito. La regola non tocca `/api/*` né i file statici (JS/GIF/manifest): Vercel li serve normalmente comunque, la riscrittura si applica solo quando non trova nient'altro.

## Spostare le GIF su Supabase Storage
Le GIF caricate finora sono hotlink a Google Drive/Photos — comodo per importarle la prima volta, ma quel servizio non è pensato per essere incorporato in un'app: a volte risponde lento, e le intestazioni di cache che manda non garantiscono che il browser le tenga salvate tra una sessione e l'altra. Questa migrazione le scarica una volta e le ricarica sul nostro Storage Supabase (bucket `exercise-gifs`, pubblico), poi aggiorna sia la libreria esercizi sia le copie già salvate dentro ai Programmi Riscaldamento/Forza/Circuito (ogni sessione porta con sé la propria copia del link GIF al momento in cui è stata composta, quindi cambiare solo la libreria non basterebbe). **Non serve nessuna modifica al codice**: i link restano semplici URL, solo il dominio cambia.

1. Esegui [`supabase/migration_gif_storage.sql`](supabase/migration_gif_storage.sql) nel SQL Editor (crea il bucket).
2. Crea un file **`.env.migration.local`** nella cartella del progetto (finisce da solo in `.gitignore` grazie al pattern `*.local` — non va mai committato) con dentro:
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
   (la trovi su Supabase → Project Settings → API → *service_role* — la stessa chiave usata per Vercel, mai in `.env.local`).
3. Lancia:
   ```bash
   npm run migrate:gifs
   ```
   Scarica e ricarica ogni GIF non ancora migrata, stampa un riepilogo (quante fatte, quali eventualmente fallite — di solito link ormai morti, da controllare a mano). Sicuro da rilanciare più volte: le GIF già su Supabase Storage vengono riconosciute e saltate.

## Note
- Le GIF sono file su Supabase Storage (bucket `exercise-gifs`, dopo la migrazione sopra) — prima erano hotlink a Google Drive/Photos, a volte lenti/inaffidabili per l'incorporamento; l'app riprova un paio di volte prima di mostrare un placeholder in ogni caso — vedi `ExGif` in `src/shared/ui.jsx`.
- **Pre-caricamento con priorità**: appena l'atleta apre l'app, `AthleteHome` pre-scarica in background le GIF dei prossimi allenamenti delle 3 sezioni (`prefetchGifs`) — Riscaldamento poi Forza poi Circuito (l'ordine tipico in palestra), con le prime in assoluto ad alta priorità e il resto a bassa. La GIF davvero a schermo nel Player (`fetchPriority="high"` su `ExGif`) ha comunque sempre la precedenza: il pre-caricamento in background non le passa mai avanti.
- **Service Worker** (`vite-plugin-pwa`, configurato in `vite.config.js`): attivo solo nella build di produzione (non in `npm run dev`). Le GIF esercizio (Supabase Storage e gli eventuali link Google Drive/Photos rimasti) si cachano cache-first per 60 giorni — la prima volta che un esercizio si vede scarica, le volte dopo è istantaneo, anche offline. Si aggiorna da solo a ogni deploy (`registerType: "autoUpdate"`), niente versioni vecchie dell'app bloccate in cache.
- La voce usa la sintesi del browser (Web Speech API): su iOS parte solo dopo un tap dell'utente — il tap su "Inizia" nell'anteprima è il gesto che la sblocca (il Player parte direttamente, niente schermata "Sta per iniziare" di mezzo).
- **Background durante l'allenamento**: una web app non può continuare a eseguire/parlare mentre il telefono è bloccato o un'altra app è in primo piano (limite di sistema operativo, non aggirabile). Mitigazioni nel Player (`src/player/WorkoutPlayer.jsx`): (1) **Wake Lock API** tiene lo schermo acceso finché l'allenamento è a schermo intero, così non va in background da solo per lo spegnimento automatico — si rilascia e viene richiesto di nuovo automaticamente ai cambi di visibilità, fallisce in silenzio dove non supportato; (2) il countdown misura il **tempo reale trascorso** tra un tick e l'altro (non assume sempre 1 secondo), così se l'utente cambia comunque app un attimo il countdown si allinea da solo al ritorno; (3) il punto in cui si è arrivati (esercizio + secondi rimasti) si salva in `localStorage` a ogni tick — se il telefono scarica e ricarica la pagina mentre l'app è in background (il caso più comune di "torna sempre a zero"), al rientro si **riprende da lì** invece che dall'inizio (in pausa, per dare tempo di riorientarsi); scade dopo 6 ore.
- Ogni atleta ha 3 assegnazioni indipendenti (`profiles.assigned_warmup_program_id`+`warmup_position`, `assigned_strength_program_id`+`strength_position`, `assigned_circuit_program_id`+`circuit_position`) — niente rami/percorsi alternativi dentro una sezione, ma le 3 sezioni non si influenzano a vicenda. Le sessioni si generano al volo dalla libreria assegnata, non sono righe salvate: eliminare/modificare un Programma assegnato cambia cosa vede l'atleta la prossima volta.
- Le percentuali/i massimali non richiedono mai un inserimento manuale di kg da parte dell'atleta; l'appuntamento di vendita resta fuori dall'app.
