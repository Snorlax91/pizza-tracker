'use client';

import { useState, useEffect } from 'react';

const CURRENT_YEAR = new Date().getFullYear();
const LOCAL_STORAGE_KEY = 'pizza-tracker-local-count';

type LocalPizzaData = {
  year: number;
  count: number;
};

export function LocalPizzaCounter() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [count, setCount] = useState(0);
  const [showInfo, setShowInfo] = useState(false);

  // Carica i dati dal localStorage
  useEffect(() => {
    const loadLocalData = () => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const data: Record<string, number> = JSON.parse(stored);
          setCount(data[year.toString()] || 0);
        }
      } catch (err) {
        console.error('Errore nel caricamento dei dati locali:', err);
      }
    };

    loadLocalData();
  }, [year]);

  // Salva i dati nel localStorage
  const saveLocalData = (newCount: number) => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const data: Record<string, number> = stored ? JSON.parse(stored) : {};
      data[year.toString()] = newCount;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      setCount(newCount);
    } catch (err) {
      console.error('Errore nel salvataggio dei dati locali:', err);
    }
  };

  const handleAdd = () => {
    saveLocalData(count + 1);
  };

  const handleSubtract = () => {
    if (count > 0) {
      saveLocalData(count - 1);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl">
        {/* Info Badge */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full">
            <span>📊</span>
            <span>Modalità Demo</span>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Informazioni"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {showInfo && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-slate-300">
            <p className="mb-2">
              ℹ️ Stai usando la <strong>modalità demo</strong>. I dati sono salvati solo sul tuo browser.
            </p>
            <p className="text-slate-400">
              Registrati per salvare le tue pizze nel cloud, aggiungere foto, ingredienti e competere nelle classifiche!
            </p>
          </div>
        )}

        {/* Year Selector */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setYear(y => y - 1)}
            className="px-3 py-2 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors"
            aria-label="Anno precedente"
          >
            <span className="text-lg">◀</span>
          </button>
          <span className="text-2xl font-bold text-slate-100 min-w-[100px] text-center">
            {year}
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="px-3 py-2 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors"
            aria-label="Anno successivo"
          >
            <span className="text-lg">▶</span>
          </button>
        </div>

        {/* Counter Display */}
        <div className="text-center mb-8">
          <div className="text-7xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2">
            {count}
          </div>
          <p className="text-lg text-slate-400">
            {count === 1 ? 'pizza mangiata' : 'pizze mangiate'}
          </p>
        </div>

        {/* Counter Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleSubtract}
            disabled={count === 0}
            className="w-14 h-14 rounded-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center text-2xl font-bold shadow-lg hover:shadow-xl"
            aria-label="Rimuovi una pizza"
          >
            −
          </button>
          <button
            onClick={handleAdd}
            className="w-16 h-16 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center text-3xl font-bold shadow-lg hover:shadow-xl"
            aria-label="Aggiungi una pizza"
          >
            +
          </button>
        </div>

        {/* Upgrade CTA */}
        <div className="mt-8 pt-6 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center mb-3">
            Vuoi salvare anche foto, ingredienti e voti?
          </p>
          <button
            onClick={() => {
              // Questo verrà gestito dal parent component
              window.dispatchEvent(new CustomEvent('showLoginModal'));
            }}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg text-sm"
          >
            ✨ Sblocca tutte le funzionalità
          </button>
        </div>
      </div>
    </div>
  );
}
