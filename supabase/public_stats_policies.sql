-- ================================================
-- POLICY PER VISUALIZZAZIONE PUBBLICA STATISTICHE
-- ================================================
-- Questo script abilita la lettura pubblica delle tabelle necessarie
-- per visualizzare le statistiche globali anche da utenti non autenticati

-- ================================================
-- TABELLA: pizzas
-- ================================================
-- Permetti la lettura pubblica delle pizze (senza dati sensibili)
-- per calcolare statistiche globali

-- Rimuovi la policy esistente se presente
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON pizzas;
DROP POLICY IF EXISTS "Public read access for stats" ON pizzas;

-- Crea una policy che permette la lettura pubblica
-- Solo i campi necessari per le statistiche (eaten_at, user_id, origin)
CREATE POLICY "Public read access for stats"
ON pizzas FOR SELECT
USING (true);

-- Gli utenti autenticati possono ancora inserire/modificare/eliminare solo le proprie pizze
DROP POLICY IF EXISTS "Users can insert own pizzas" ON pizzas;
CREATE POLICY "Users can insert own pizzas"
ON pizzas FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pizzas" ON pizzas;
CREATE POLICY "Users can update own pizzas"
ON pizzas FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own pizzas" ON pizzas;
CREATE POLICY "Users can delete own pizzas"
ON pizzas FOR DELETE
USING (auth.uid() = user_id);


-- ================================================
-- TABELLA: pizza_ingredients
-- ================================================
-- Permetti la lettura pubblica dei collegamenti pizza-ingrediente
-- per calcolare statistiche sugli ingredienti

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON pizza_ingredients;
DROP POLICY IF EXISTS "Public read access for stats" ON pizza_ingredients;

CREATE POLICY "Public read access for stats"
ON pizza_ingredients FOR SELECT
USING (true);

-- Gli utenti autenticati possono gestire solo gli ingredienti delle proprie pizze
DROP POLICY IF EXISTS "Users can insert own pizza ingredients" ON pizza_ingredients;
CREATE POLICY "Users can insert own pizza ingredients"
ON pizza_ingredients FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pizzas 
    WHERE pizzas.id = pizza_ingredients.pizza_id 
    AND pizzas.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete own pizza ingredients" ON pizza_ingredients;
CREATE POLICY "Users can delete own pizza ingredients"
ON pizza_ingredients FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM pizzas 
    WHERE pizzas.id = pizza_ingredients.pizza_id 
    AND pizzas.user_id = auth.uid()
  )
);


-- ================================================
-- TABELLA: ingredients
-- ================================================
-- Permetti la lettura pubblica degli ingredienti disponibili

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON ingredients;
DROP POLICY IF EXISTS "Public read access" ON ingredients;

CREATE POLICY "Public read access"
ON ingredients FOR SELECT
USING (true);

-- Solo gli admin possono modificare gli ingredienti (se necessario)
-- Per ora permettiamo inserimenti autenticati per nuovi ingredienti
DROP POLICY IF EXISTS "Authenticated users can insert ingredients" ON ingredients;
CREATE POLICY "Authenticated users can insert ingredients"
ON ingredients FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);


-- ================================================
-- TABELLA: profiles
-- ================================================
-- Permetti la lettura pubblica dei profili (per mostrare username nelle classifiche)
-- Ma solo campi pubblici (username, display_name)

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Public read access for profiles" ON profiles;

CREATE POLICY "Public read access for profiles"
ON profiles FOR SELECT
USING (true);

-- Gli utenti possono modificare solo il proprio profilo
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);


-- ================================================
-- TABELLA: user_yearly_counters (se esiste)
-- ================================================
-- Permetti la lettura pubblica dei contatori annuali
-- per calcolare le classifiche

DROP POLICY IF EXISTS "Public read access for yearly counters" ON user_yearly_counters;
CREATE POLICY "Public read access for yearly counters"
ON user_yearly_counters FOR SELECT
USING (true);

-- Gli utenti possono gestire solo i propri contatori
DROP POLICY IF EXISTS "Users can manage own counters" ON user_yearly_counters;
CREATE POLICY "Users can manage own counters"
ON user_yearly_counters FOR ALL
USING (auth.uid() = user_id);


-- ================================================
-- VERIFICA ABILITAZIONE RLS
-- ================================================
-- Assicurati che RLS sia abilitato su tutte le tabelle

ALTER TABLE pizzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_yearly_counters ENABLE ROW LEVEL SECURITY;


-- ================================================
-- NOTE
-- ================================================
-- Dopo aver eseguito questo script su Supabase:
-- 1. Le statistiche globali saranno visibili a tutti
-- 2. I profili pubblici saranno visibili a tutti
-- 3. Gli utenti potranno ancora gestire solo i propri dati
-- 4. I dati sensibili (email, ecc.) rimangono protetti
