# 🍕 Pizza Tracker - Modalità Pubblica

Questo branch implementa la possibilità di utilizzare Pizza Tracker anche senza essere loggati.

## ✨ Nuove Funzionalità

### 1. Homepage Pubblica con Counter Locale
- Gli utenti non loggati possono subito iniziare a contare le loro pizze
- I dati sono salvati in `localStorage` (solo sul browser dell'utente)
- Counter funzionale per anno con +/- 
- Badge "Modalità Demo" per chiarire che i dati sono locali
- CTA per registrarsi e sbloccare tutte le funzionalità

### 2. Statistiche Globali Pubbliche
- La pagina `/stats` è accessibile anche senza login
- Mostra tutte le statistiche aggregate della community
- Ingredienti più popolari, classifiche utenti, ecc.

### 3. Pagine Protette
Le seguenti pagine richiedono autenticazione:
- `/pizzas` - Le mie pizze
- `/friends` - Amici
- `/groups` - Gruppi  
- `/profile` - Profilo

Quando un utente non loggato tenta di accedervi, vede:
- Un elegante modal che spiega i vantaggi della registrazione
- Possibilità di continuare senza account o registrarsi

### 4. Header Dinamico
- Mostra link diversi in base allo stato di login
- Pulsante "Accedi" per utenti non loggati
- Pulsante "Esci" per utenti loggati

## 🔧 Setup Supabase

**IMPORTANTE**: Per far funzionare le statistiche pubbliche, devi configurare le Row Level Security policies su Supabase.

### Passaggi:

1. Vai su https://app.supabase.com e apri il tuo progetto
2. Clicca su **SQL Editor** nel menu laterale
3. Copia il contenuto del file `supabase/public_stats_policies.sql`
4. Incollalo nell'editor e clicca **Run**
5. Verifica che non ci siano errori

Le policy permettono:
- ✅ Lettura pubblica di pizze, ingredienti, profili per le statistiche
- 🔒 Scrittura protetta: solo sui propri dati

Per dettagli completi, leggi `supabase/README.md`

## 📦 Nuovi Componenti

- `components/LoginPromptModal.tsx` - Modal elegante per invitare alla registrazione
- `components/LocalPizzaCounter.tsx` - Counter funzionante con localStorage
- `components/ProtectedRoute.tsx` - Wrapper per proteggere pagine riservate

## 🎨 Design

- Landing page moderna con gradients e animazioni
- Counter interattivo con feedback visivo
- Badge e info per distinguere modalità demo da modalità completa
- CTA chiari per la conversione da visitor a utente registrato

## 🧪 Testing

Per testare il flusso completo:

1. **Modalità Incognito** - Apri l'app in una finestra incognito
2. **Homepage** - Verifica che il counter locale funzioni
3. **Stats** - Vai su `/stats` e verifica che le statistiche si carichino
4. **Pagine protette** - Prova ad accedere a `/pizzas` → dovrebbe apparire il modal
5. **Login** - Clicca "Accedi" e verifica il flusso di registrazione

## 🚀 Deploy

Dopo aver eseguito le policy SQL su Supabase, puoi fare il deploy normalmente:

```bash
git add .
git commit -m "feat: add public access with local counter and public stats"
git push origin feature/non-logged-usage
```

Poi crea una Pull Request per mergiare su `master`.

## 📝 Note

- I dati in localStorage sono salvati per anno: `{2024: 10, 2025: 5}`
- Quando un utente si registra, perde i dati locali (non vengono migrati automaticamente)
- Potresti aggiungere in futuro una funzione "Importa dati locali" dopo il login
