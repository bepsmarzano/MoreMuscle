# More Muscle

Web app per creare e somministrare allenamenti a tempo con GIF, countdown e annunci vocali. Un admin crea la libreria esercizi e gli allenamenti, invita gli atleti via email e assegna a ciascuno l'allenamento giusto in base a un questionario che l'atleta compila al primo accesso.

## Stack
React 18 + Vite + Supabase (auth + Postgres) + Vercel (deploy + funzione serverless per gli inviti).

## Setup — prima di avviare in locale
1. **Supabase**: hai già un progetto — apri il SQL Editor e incolla/esegui tutto [`supabase/schema.sql`](supabase/schema.sql). Crea le tabelle (`profiles`, `library`, `workouts`, `questionnaire_responses`), le RLS policy e i trigger.
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
- **Admin** (tu): libreria esercizi, editor allenamenti a blocchi, tab **Atleti** per invitare nuovi atleti via email e assegnare loro un allenamento.
- **Atleta**: al primo accesso compila un questionario standard (obiettivo, livello, infortuni/limitazioni, giorni disponibili, attrezzatura — modificabile in seguito); finché l'admin non gli assegna un allenamento vede una schermata d'attesa; poi vede l'anteprima e può avviare il Player.

Gli atleti **non si autoregistrano**: li inviti tu dal pannello Atleti (email + nome opzionale), Supabase manda l'invito e l'atleta imposta la password al primo accesso tramite quel link.

## Cosa fa
- **Libreria esercizi** — crei ogni esercizio una volta (nome, URL GIF, rep e tempo di default) e lo riusi. Importabile anche da CSV/Google Sheet (pulsante "Importa" in Libreria).
- **Editor allenamento** — 2+ blocchi da 4-5 esercizi, riposo configurabile tra i blocchi. Gli esercizi si pescano dalla libreria; rep/tempo si possono sovrascrivere per il singolo allenamento.
- **Anteprima** — griglia di tutti gli esercizi prima di iniziare.
- **Player** — a schermo intero, GIF di sfondo, countdown circolare in sovrimpressione, controlli play/pausa/avanti/indietro, annunci vocali in italiano (Web Speech API):
  - inizio → "sta per iniziare il tuo more muscle"
  - 10s prima del cambio → "mancano 10 secondi"
  - nuovo esercizio → "[nome]. Fai X ripetizioni"
  - riposo tra blocchi e messaggio finale

## Struttura del codice
```
src/
  lib/        client Supabase + tutte le funzioni di accesso dati (api.js)
  shared/     stile visuale condiviso (S), placeholder GIF, componente ExGif
  player/     Preview + Player (esecuzione allenamento), usato da admin e atleta
  admin/      WorkoutBuilder (libreria + editor allenamenti) e AdminAthletes (inviti/assegnazione)
  athlete/    Questionnaire + AthleteHome
  auth/       AuthProvider (sessione+ruolo), LoginScreen, SetPassword
api/
  invite-athlete.js   funzione serverless Vercel: unico posto che usa la service role key
supabase/
  schema.sql          da eseguire manualmente nel SQL Editor di Supabase
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

## Note
- Le GIF sono URL esterni (Google Drive/Photos funzionano ma a volte falliscono in modo transitorio: l'app riprova un paio di volte prima di mostrare un placeholder — vedi `ExGif` in `src/shared/ui.jsx`).
- La voce usa la sintesi del browser: su iOS parte solo dopo un tap dell'utente (il pulsante "Sta per iniziare" va bene).
- Niente storico: un atleta ha un solo allenamento assegnato alla volta (`profiles.assigned_workout_id`), sovrascrivibile dall'admin. Stessa scelta per l'appuntamento di vendita, che resta fuori dall'app.
