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
      {/* Info Badge - Modalità Demo */}
      <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-slate-300">
        <div className="flex items-start gap-2">
          <span className="text-base">ℹ️</span>
          <div>
            <p className="font-semibold mb-1">Modalità Demo</p>
            <p className="text-slate-400">
              I dati sono salvati solo sul tuo browser. Registrati per salvare nel cloud, aggiungere foto, ingredienti e competere nelle classifiche!
            </p>
          </div>
        </div>
      </div>

      {/* Selettore anno */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          onClick={() => setYear(y => y - 1)}
          className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
          aria-label="Anno precedente"
        >
          ◀
        </button>
        <span className="text-sm text-slate-300">
          Pizze dell&apos;anno{' '}
          <span className="font-semibold text-slate-50">{year}</span>
        </span>
        <button
          onClick={() => setYear(y => y + 1)}
          className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
          aria-label="Anno successivo"
        >
          ▶
        </button>
      </div>

      {/* Counter Display - Stesso stile del counter loggato */}
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-5 mb-4">
        <p className="text-sm text-slate-400 mb-1">
          Pizze mangiate da te nel {year}
        </p>
        <p className="text-5xl font-black mb-2">
          {count}
        </p>
        <p className="text-xs text-slate-400">
          Conteggio salvato localmente sul tuo browser.
        </p>
      </div>

      {/* Bottone +1 Pizza */}
      <button
        onClick={handleAdd}
        className="w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold text-xl shadow-lg shadow-amber-500/30 hover:bg-amber-300 transition mb-3"
        aria-label="Aggiungi una pizza"
      >
        +1 Pizza
      </button>

      {/* Bottone Annulla */}
      <button
        onClick={handleSubtract}
        disabled={count === 0}
        className="w-full py-2 rounded-xl text-xs border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        aria-label="Rimuovi una pizza"
      >
        Annulla ultima pizza
      </button>

      {/* Upgrade CTA */}
      <div className="mt-4 pt-4 border-t border-slate-700">
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
  );
}
