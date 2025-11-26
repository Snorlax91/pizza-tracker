'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/auth');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(
            'id, username, display_name, needs_onboarding'
          )
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;
        if (!profile) {
          setErrorMsg('Profilo non trovato.');
          return;
        }

        // Se non ha più bisogno di onboarding, mandalo in home
        if (profile.needs_onboarding === false) {
          router.push('/');
          return;
        }

        // Lasciamo i campi vuoti per farli scegliere all'utente
        // Se nel db ci sono già valori (diversi dall'email), li usiamo
        const email = user.email ?? '';
        const emailPrefix = email.includes('@')
          ? email.split('@')[0]
          : email;

        const fullName =
          (user.user_metadata &&
            (user.user_metadata.full_name ||
              user.user_metadata.name)) ||
          '';

        // Usa i valori dal db solo se non sono l'email
        const dbUsername = profile.username || '';
        const dbDisplayName = profile.display_name || '';
        
        setUsername(
          dbUsername && dbUsername !== email && !dbUsername.includes(email) 
            ? dbUsername 
            : ''
        );
        setDisplayName(
          dbDisplayName && dbDisplayName !== email && !dbDisplayName.includes(email)
            ? dbDisplayName
            : fullName || ''
        );
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ??
            'Errore nel caricamento dei dati di onboarding.'
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const validateUsername = (value: string) => {
    if (value.length < 3 || value.length > 20) {
      return 'Il nickname deve essere tra 3 e 20 caratteri.';
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
      return 'Il nickname può contenere solo lettere, numeri, . e _.';
    }
    return null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();

    const usernameError = validateUsername(trimmedUsername);
    if (usernameError) {
      setErrorMsg(usernameError);
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push('/auth');
        return;
      }

      // Controlliamo che l'username sia univoco
      const { data: existing, error: existingError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .neq('id', user.id)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
      }

      if (existing) {
        setErrorMsg('Questo nickname è già in uso, scegline un altro.');
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: trimmedUsername,
          display_name: trimmedDisplayName || trimmedUsername,
          needs_onboarding: false,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message ?? 'Errore nel salvataggio delle impostazioni.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p>Caricamento...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full px-4">
        <h1 className="text-2xl font-bold text-center mb-4">
          Benvenuto su Pizza Tracker 🍕
        </h1>
        <p className="text-sm text-slate-300 text-center mb-6">
          Scegli il tuo nickname per iniziare!
        </p>

        <form
          onSubmit={handleSave}
          className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4"
        >
          {errorMsg && (
            <p className="text-sm text-red-400">{errorMsg}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs text-slate-300">
              Nickname (univoco)
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
              placeholder="es. pizza.master"
              required
            />
            <p className="text-[11px] text-slate-400">
              Sarà usato per essere trovato dagli amici e per il link al
              tuo profilo.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-300">Nome visibile</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
              placeholder="es. Mario Pizza Lover"
            />
            <p className="text-[11px] text-slate-400">
              Comparirà nelle classifiche e nelle liste. Se vuoto, useremo
              il nickname.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-full py-2.5 rounded-xl bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvo...' : 'Inizia a tracciare le pizze'}
          </button>
        </form>
      </div>
    </main>
  );
}
