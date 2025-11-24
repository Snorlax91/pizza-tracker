'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type LoginPromptModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginPromptModal({ isOpen, onClose }: LoginPromptModalProps) {
  const router = useRouter();

  // Chiudi modal premendo ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLogin = () => {
    router.push('/auth');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl max-w-lg w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pulsante chiusura */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Chiudi"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Contenuto */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🍕✨</div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">
            Sblocca tutte le funzionalità!
          </h2>
          <p className="text-slate-400 text-sm">
            Accedi per sfruttare al massimo Pizza Tracker
          </p>
        </div>

        {/* Vantaggi */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-xl">
              📊
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100 text-sm mb-1">
                Salva le tue pizze
              </h3>
              <p className="text-xs text-slate-400">
                Traccia ogni pizza che mangi, con foto, voti e ingredienti
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
              🏆
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100 text-sm mb-1">
                Classifiche personali
              </h3>
              <p className="text-xs text-slate-400">
                Scopri i tuoi ingredienti preferiti e le tue statistiche
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl">
              👥
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100 text-sm mb-1">
                Amici e gruppi
              </h3>
              <p className="text-xs text-slate-400">
                Condividi le tue pizze con amici e crea sfide di gruppo
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-xl">
              🔒
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100 text-sm mb-1">
                Veloce e sicuro
              </h3>
              <p className="text-xs text-slate-400">
                Login con Google in un click, senza password da ricordare
              </p>
            </div>
          </div>
        </div>

        {/* Azioni */}
        <div className="space-y-3">
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 px-6 rounded-full transition-all shadow-lg hover:shadow-xl"
          >
            Accedi con Google 🚀
          </button>
          <button
            onClick={onClose}
            className="w-full text-slate-400 hover:text-slate-200 text-sm py-2 transition-colors"
          >
            Continua senza account
          </button>
        </div>
      </div>
    </div>
  );
}
