'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { PizzaDetailsPanel } from '@/components/PizzaDetailsPanel';

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore durante l’operazione.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setErrorMsg(null);
    setOauthLoading(provider);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/`
              : undefined,
        },
      });

      if (error) throw error;
      // Non serve fare altro: verrà fatto un redirect automatico dal provider
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message ?? 'Errore durante l’accesso con il provider.'
      );
      setOauthLoading(null);
    }
  };



  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full px-4">
        <h1 className="text-3xl font-bold text-center mb-6">
          Pizza Tracker 🍕
        </h1>

        <div className="flex justify-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`px-4 py-2 rounded-full text-sm font-semibold border ${
              mode === 'login'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-500 text-slate-100'
            }`}
          >
            Accedi
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`px-4 py-2 rounded-full text-sm font-semibold border ${
              mode === 'signup'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-500 text-slate-100'
            }`}
          >
            Registrati
          </button>
        </div>

        {/* Social login */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 mb-4">
          <p className="text-sm text-slate-300 mb-3 text-center">
            Entra velocemente con:
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleOAuthLogin('google')}
              disabled={!!oauthLoading}
              className="w-full py-2.5 rounded-xl bg-white text-slate-900 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'google'
                ? 'Reindirizzamento a Google...'
                : 'Continua con Google'}
            </button>

            {/* Se vuoi anche GitHub, basta attivare il provider in Supabase e scommentare qui */}
            {/* 
            <button
              type="button"
              onClick={() => handleOAuthLogin('github')}
              disabled={!!oauthLoading}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-900 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {oauthLoading === 'github'
                ? 'Reindirizzamento a GitHub...'
                : 'Continua con GitHub'}
            </button>
            */}
          </div>
        </div>

        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-slate-500">
              oppure email
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
            />
          </div>

          {errorMsg && (
            <p className="text-sm text-red-400">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading || !!oauthLoading}
            className="mt-2 w-full py-2.5 rounded-xl bg-slate-100 text-slate-900 font-semibold hover:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Attendere...'
              : mode === 'login'
              ? 'Accedi con email'
              : 'Registrati con email'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Dopo l&apos;accesso verrai portato alla tua dashboard delle pizze.
        </p>
      </div>
    </main>
  );
}
