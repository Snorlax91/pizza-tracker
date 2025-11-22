// app/test-supabase/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function TestSupabasePage() {
  const [message, setMessage] = useState('Caricamento...');

  useEffect(() => {
    const run = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.error(error);
          setMessage('Supabase risponde, ma non sei loggato.');
        } else if (user) {
          setMessage(`Supabase OK! Utente loggato: ${user.email}`);
        } else {
          setMessage('Supabase OK! Nessun utente loggato.');
        }
      } catch (err) {
        console.error(err);
        setMessage('Errore nel contatto con Supabase.');
      }
    };

    run();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-md w-full px-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Test Supabase</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}
