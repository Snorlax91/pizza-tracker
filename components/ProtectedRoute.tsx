'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { LoginPromptModal } from './LoginPromptModal';
import { AppHeader } from './AppHeader';

type ProtectedRouteProps = {
  children: React.ReactNode;
  redirectToAuth?: boolean;
};

export function ProtectedRoute({ children, redirectToAuth = false }: ProtectedRouteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setUser(null);
        setLoading(false);
        if (redirectToAuth) {
          router.push('/auth');
        } else {
          setShowLoginModal(true);
        }
        return;
      }

      setUser(user);
      setLoading(false);
    };

    checkUser();
  }, [router, redirectToAuth]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center">
          <div className="text-5xl mb-4">🍕</div>
          <p>Caricamento...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPromptModal 
          isOpen={showLoginModal} 
          onClose={() => {
            setShowLoginModal(false);
            router.push('/');
          }} 
        />
        <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
          <AppHeader isLoggedIn={false} onLoginClick={() => setShowLoginModal(true)} />
          <div className="text-center px-4">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold mb-2">Accesso richiesto</h1>
            <p className="text-slate-400 mb-6">
              Devi effettuare l'accesso per visualizzare questa pagina
            </p>
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-full transition-all shadow-lg hover:shadow-xl"
            >
              Accedi ora
            </button>
          </div>
        </main>
      </>
    );
  }

  return <>{children}</>;
}
