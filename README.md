# More Muscle

Web app per creare e somministrare piani di allenamento con GIF, countdown e annunci vocali. Un admin costruisce tre librerie riusabili — **Riscaldamenti**, **Programmi Forza**, **Programmi Circuito** — e le combina in **Piani** da assegnare agli atleti; invita gli atleti via email e assegna a ciascuno il piano giusto in base a un questionario che l'atleta compila al primo accesso.

## Stack
React 18 + Vite + Supabase (auth + Postgres) + Vercel (deploy + funzione serverless per gli inviti).

## Setup — prima di avviare in locale
1. **Supabase**: hai già un progetto — apri il SQL Editor e incolla/esegui **in ordine**:
   - [`supabase/schema.sql`](supabase/schema.sql) — tabelle base (`profiles`, `library`, `workouts`, `questionnaire_responses`), RLS, trigger.
   - [`supabase/migration_strength_plans.sql`](supabase/migration_strength_plans.sql) — massimali, log allenamento, piani/sessioni.
   - [`supabase/migration_program_composition.sql`](supabase/migration_program_composition.sql) — Riscaldamenti/Programmi Forza/Programmi Circuito come librerie riusabili, composte nel piano.
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
- **Admin** (tu): Libreria esercizi, Riscaldamenti, Programmi Forza, Programmi Circuito, Piani (li combina), Atleti (inviti/assegnazione/massimali/log).
- **Atleta**: al primo accesso compila un questionario standard (obiettivo, livello, infortuni/limitazioni, giorni disponibili, attrezzatura — modificabile in seguito); finché l'admin non gli assegna un piano vede una schermata d'attesa; poi vede solo la **prossima sessione** — completata quella, l'app passa automaticamente alla successiva. A fine piano compare un messaggio di completamento.

Gli atleti **non si autoregistrano**: li inviti tu dal pannello Atleti (email + nome opzionale), Supabase manda l'invito e l'atleta imposta la password al primo accesso tramite quel link.

## Cosa fa
- **Libreria esercizi** — nome, URL GIF, rep e tempo di default, attrezzatura (corpo libero / 1-2 manubri / kettlebell). Importabile anche da CSV/Google Sheet.
- **Riscaldamenti** — routine a corpo libero riusabili (N esercizi + round). Un piano ne mette un set in **rotazione fissa** tra le sessioni (sessione i → pool[i % lunghezza pool]).
- **Programmi Forza** — sequenza ordinata di sessioni Forza (progressione), riusabile su più piani/atleti. Ogni sessione: un solo esercizio, serie di riscaldamento specifico (avvicinamento al peso — reps + nota libera) + serie di lavoro a **percentuale del massimale** dell'atleta (peso calcolato automaticamente, mai a mano), ognuna anche impostabile come **AMRAP**.
- **Programmi Circuito** — sequenza ordinata di sessioni Circuito (progressione), stessa struttura di un Riscaldamento ma pensata per progredire nel tempo.
- **Piani** — combinano **1** pool di Riscaldamenti (rotazione) + **1** Programma Forza + **1** Programma Circuito + un riposo tra blocchi. Forza e Circuito avanzano sempre insieme, stessa sessione (`N sessioni totali` = minimo tra le lunghezze dei due programmi). Le sessioni non sono righe salvate: si **assemblano al volo** quando l'atleta le richiede.
- **Player** — a schermo intero, GIF di sfondo, controlli play/pausa/avanti/indietro, annunci vocali (Web Speech API del browser). Countdown per esercizi/serie; il **riposo tra blocchi è un cronometro che conta in su** (nessun tempo imposto: l'atleta preme avanti quando è pronto, vedendo quanto tempo è passato). Durante l'esecuzione, l'app chiede all'atleta di annotare:
  - le ripetizioni fatte, a fine di una serie di lavoro AMRAP
  - il livello di carico usato (corpo libero escluso), a fine di un esercizio con attrezzo nel Circuito

  Le annotazioni finiscono nello storico consultabile dal pannello Atleti.

## Struttura del codice
```
src/
  lib/        client Supabase + tutte le funzioni di accesso dati (api.js)
  shared/     stile visuale condiviso (S), placeholder GIF, componente ExGif
  player/     Preview + Player (esecuzione sessione, blocchi standard e Forza), usato da admin e atleta
  admin/
    WorkoutBuilder.jsx    guscio admin (nav) + Libreria esercizi
    blockEditors.jsx      editor condivisi: LibraryPicker, StandardBlockEditor, StrengthBlockEditor
    WarmupLibrary.jsx     CRUD riscaldamenti riusabili
    StrengthPrograms.jsx  CRUD programmi Forza (sequenze di sessioni)
    CircuitPrograms.jsx   CRUD programmi Circuito (sequenze di sessioni)
    PlanBuilder.jsx       composizione piani + "prova sessione" per QA
    AdminAthletes.jsx     inviti, assegnazione piano, massimali, storico log
  athlete/    Questionnaire + AthleteHome (prossima sessione del piano assegnato)
  auth/       AuthProvider (sessione+ruolo), LoginScreen, SetPassword
api/
  invite-athlete.js   funzione serverless Vercel: invita un atleta via email (service role key)
supabase/
  schema.sql                        da eseguire manualmente nel SQL Editor di Supabase
  migration_strength_plans.sql      idem, dopo schema.sql
  migration_program_composition.sql idem, dopo le due precedenti
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
- La voce usa la sintesi del browser (Web Speech API): su iOS parte solo dopo un tap dell'utente (il pulsante "Sta per iniziare" va bene).
- Un atleta ha un solo piano assegnato alla volta e avanza in avanti sessione dopo sessione (`profiles.assigned_plan_id` + `current_session_position`) — niente rami/percorsi alternativi. Le sessioni si generano al volo dalle librerie del piano, non sono righe salvate: eliminare/modificare un Programma o un Riscaldamento referenziato da un piano assegnato cambia cosa vede l'atleta la prossima volta.
- Le percentuali/i massimali non richiedono mai un inserimento manuale di kg da parte dell'atleta; l'appuntamento di vendita resta fuori dall'app.
