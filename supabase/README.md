# Supabase Database Policies

Questa cartella contiene gli script SQL per configurare le policy di Row Level Security (RLS) su Supabase.

## Policy per Statistiche Pubbliche

Il file `public_stats_policies.sql` contiene le policy necessarie per permettere la visualizzazione delle statistiche globali anche da utenti non autenticati.

### Come applicare le policy

1. Accedi al tuo progetto Supabase: https://app.supabase.com
2. Vai su **SQL Editor** nel menu laterale
3. Crea una nuova query
4. Copia e incolla il contenuto di `public_stats_policies.sql`
5. Esegui la query cliccando su **Run** o premendo `Ctrl+Enter`

### Cosa fanno queste policy

Le policy configurate permettono:

✅ **Lettura pubblica** (anche da non autenticati):
- `pizzas` - per calcolare statistiche globali sulle pizze
- `pizza_ingredients` - per statistiche sugli ingredienti
- `ingredients` - per mostrare gli ingredienti disponibili
- `profiles` - per mostrare username/display_name nelle classifiche
- `user_yearly_counters` - per le classifiche annuali

🔒 **Scrittura protetta** (solo utenti autenticati sui propri dati):
- Gli utenti possono inserire/modificare/eliminare solo le proprie pizze
- Gli utenti possono modificare solo il proprio profilo
- Gli utenti possono gestire solo i propri contatori

### Verifica che le policy siano attive

Dopo aver eseguito lo script, puoi verificare che tutto funzioni:

1. Apri l'app in modalità incognito (senza essere loggato)
2. Vai su `/stats` - dovresti vedere le statistiche globali
3. Prova ad accedere a `/pizzas` - dovresti vedere il prompt di login

### Sicurezza

Le policy sono configurate per:
- ✅ Permettere la lettura delle statistiche aggregate
- ✅ Proteggere i dati personali (email, ecc.)
- ✅ Impedire modifiche non autorizzate
- ✅ Mantenere l'isolamento tra utenti

### Troubleshooting

Se le statistiche non si caricano:

1. Verifica che RLS sia abilitato sulle tabelle
2. Controlla che le policy siano state create correttamente nella dashboard Supabase (sezione Authentication > Policies)
3. Verifica eventuali errori nella console del browser (F12)
4. Controlla i log di Supabase per errori di policy

### Rollback

Se vuoi tornare alle policy precedenti (solo autenticati):

```sql
-- Rimuovi le policy pubbliche
DROP POLICY IF EXISTS "Public read access for stats" ON pizzas;
DROP POLICY IF EXISTS "Public read access for stats" ON pizza_ingredients;
DROP POLICY IF EXISTS "Public read access" ON ingredients;
DROP POLICY IF EXISTS "Public read access for profiles" ON profiles;
DROP POLICY IF EXISTS "Public read access for yearly counters" ON user_yearly_counters;

-- Ricrea le policy solo per autenticati
CREATE POLICY "Enable read access for authenticated users" ON pizzas
FOR SELECT USING (auth.role() = 'authenticated');

-- (continua per le altre tabelle...)
```
