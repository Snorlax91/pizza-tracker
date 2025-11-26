-- Aggiornamento trigger creazione profilo utente
-- Modifica per NON pre-popolare username e display_name con l'email
-- Gli utenti dovranno scegliere questi valori durante l'onboarding

-- Drop della vecchia function se esiste
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Ricrea la function con i campi vuoti
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
begin
  -- Crea il profilo con username e display_name NULL
  -- L'utente li sceglierà durante l'onboarding
  insert into public.profiles (id, username, display_name, needs_onboarding)
  values (new.id, null, null, true);
  return new;
end;
$$;

-- Ricrea il trigger se necessario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Note:
-- - username e display_name saranno NULL fino al completamento dell'onboarding
-- - needs_onboarding è settato a true per forzare il passaggio dalla pagina /onboarding
-- - L'utente dovrà scegliere attivamente il proprio nickname invece di avere l'email come default
