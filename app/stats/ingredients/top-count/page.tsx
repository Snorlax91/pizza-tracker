'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';
import { getIngredientEmoji } from '@/lib/ingredientEmojis';

type LeaderboardRow = {
  ingredientId: number;
  name: string;
  count: number;
};

type ViewMode = 'top' | 'all' | 'search';

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 50;

export default function TopIngredientsByCountPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState<number | 'all'>('all');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('top');
  const [currentPage, setCurrentPage] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState<number | null>(
    null
  );
  const [searchError, setSearchError] = useState<string | null>(null);

  // Carica ingredienti per il periodo selezionato
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      setLeaderboard([]);
      setViewMode('top');
      setCurrentPage(0);
      setSearchTerm('');
      setSearchResultIndex(null);
      setSearchError(null);

      try {
        const startDate =
          month === 'all'
            ? `${year}-01-01`
            : `${year}-${String(month).padStart(2, '0')}-01`;

        const endDate = (() => {
          if (month === 'all') return `${year}-12-31`;
          const lastDay = new Date(year, Number(month), 0).getDate();
          return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        })();

        const { data, error } = await supabase
          .from('pizza_ingredients')
          .select(
            `
            ingredient_id,
            ingredients ( id, name ),
            pizzas!inner (
              eaten_at
            )
          `
          )
          .gte('pizzas.eaten_at', startDate)
          .lte('pizzas.eaten_at', endDate);

        if (error) throw error;

        const counts: Record<number, { name: string; count: number }> = {};

        (data ?? []).forEach((row: any) => {
          const ingId = row.ingredient_id as number;
          const ingName = row.ingredients?.name as string | undefined;
          const eaten_at = row.pizzas?.eaten_at as string | null;

          if (!ingId || !ingName || !eaten_at) return;

          if (!counts[ingId]) {
            counts[ingId] = { name: ingName, count: 0 };
          }
          counts[ingId].count += 1;
        });

        const lb: LeaderboardRow[] = Object.entries(counts)
          .map(([id, v]) => ({
            ingredientId: Number(id),
            name: v.name,
            count: v.count,
          }))
          .sort((a, b) => b.count - a.count);

        setLeaderboard(lb);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ??
            'Errore nel caricamento della classifica ingredienti.'
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [year, month]);

  const periodLabel =
    month === 'all'
      ? `tutto il ${year}`
      : `${String(month).padStart(2, '0')}/${year}`;

  const pageCount = useMemo(() => {
    if (leaderboard.length === 0) return 0;
    return Math.ceil(leaderboard.length / PAGE_SIZE);
  }, [leaderboard.length]);

  // Ricerca ingrediente
  const handleSearch = () => {
    setSearchError(null);

    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      setSearchResultIndex(null);
      setViewMode('top');
      return;
    }

    const idx = leaderboard.findIndex(row =>
      row.name.toLowerCase().includes(q)
    );

    if (idx === -1) {
      setSearchResultIndex(null);
      setViewMode('all');
      setSearchError(
        'Nessun ingrediente trovato in classifica con questo nome.'
      );
      return;
    }

    setSearchResultIndex(idx);
    setViewMode('search');
  };

  // Calcolo della porzione da mostrare
  const displayedLeaderboard = useMemo(() => {
    if (leaderboard.length === 0) return [];

    if (viewMode === 'top') {
      return leaderboard.slice(0, PAGE_SIZE);
    }

    if (viewMode === 'all') {
      const start = currentPage * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      return leaderboard.slice(start, end);
    }

    // viewMode === 'search' → finestra intorno all'ingrediente trovato
    const windowSize = 5;
    const index = searchResultIndex ?? -1;

    if (index === -1) {
      // se non c'è risultato, fallback alla top 50
      return leaderboard.slice(0, PAGE_SIZE);
    }

    const start = Math.max(0, index - windowSize);
    const end = Math.min(leaderboard.length, index + windowSize + 1);
    return leaderboard.slice(start, end);
  }, [leaderboard, viewMode, currentPage, searchResultIndex]);

  const displayedRangeInfo = useMemo(() => {
    if (
      leaderboard.length === 0 ||
      displayedLeaderboard.length === 0
    )
      return null;

    const firstIdx = leaderboard.findIndex(
      r => r.ingredientId === displayedLeaderboard[0].ingredientId
    );
    const lastIdx = leaderboard.findIndex(
      r =>
        r.ingredientId ===
        displayedLeaderboard[displayedLeaderboard.length - 1].ingredientId
    );
    if (firstIdx === -1 || lastIdx === -1) return null;

    return {
      startPos: firstIdx + 1,
      endPos: lastIdx + 1,
      total: leaderboard.length,
    };
  }, [leaderboard, displayedLeaderboard]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader />

      <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-sm font-semibold">
            Classifica globale ingredienti – numero di pizze
          </h1>
          <p className="text-[11px] text-slate-400">
            Ingredienti ordinati per numero di pizze in cui compaiono nel
            periodo selezionato ({periodLabel}).
          </p>
        </div>

        {/* Controlli periodo */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Anno:</span>
            <button
              onClick={() => setYear(y => y - 1)}
              className="px-2 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
            >
              ◀
            </button>
            <span className="w-10 text-center">{year}</span>
            <button
              onClick={() => setYear(y => y + 1)}
              className="px-2 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
            >
              ▶
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Mese:</span>
            <select
              value={month}
              onChange={e =>
                setMonth(
                  e.target.value === 'all'
                    ? 'all'
                    : Number(e.target.value)
                )
              }
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700"
            >
              <option value="all">Tutti</option>
              <option value={1}>Gen</option>
              <option value={2}>Feb</option>
              <option value={3}>Mar</option>
              <option value={4}>Apr</option>
              <option value={5}>Mag</option>
              <option value={6}>Giu</option>
              <option value={7}>Lug</option>
              <option value={8}>Ago</option>
              <option value={9}>Set</option>
              <option value={10}>Ott</option>
              <option value={11}>Nov</option>
              <option value={12}>Dic</option>
            </select>
          </div>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        {loading ? (
          <p className="text-sm text-slate-300">
            Carico la classifica...
          </p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nessun ingrediente ha pizze associate in questo periodo.
          </p>
        ) : (
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
            {/* Barra controlli vista + ricerca */}
            <div className="flex flex-wrap items-center gap-2 justify-between text-[11px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('top');
                    setSearchResultIndex(null);
                    setSearchError(null);
                  }}
                  className={`px-3 py-1 rounded-full border ${
                    viewMode === 'top'
                      ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                      : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  Top 50
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('all');
                    setSearchResultIndex(null);
                    setSearchError(null);
                    setCurrentPage(0);
                  }}
                  className={`px-3 py-1 rounded-full border ${
                    viewMode === 'all'
                      ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                      : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  Tutti (paginato)
                </button>
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cerca ingrediente..."
                  className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px] focus:outline-none focus:ring focus:ring-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="px-3 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                >
                  Vai
                </button>
              </div>
            </div>

            {searchError && (
              <p className="text-[11px] text-red-400">{searchError}</p>
            )}

            {displayedRangeInfo && (
              <p className="text-[11px] text-slate-400">
                Stai vedendo le posizioni{' '}
                <span className="font-semibold">
                  #{displayedRangeInfo.startPos}
                </span>{' '}
                –{' '}
                <span className="font-semibold">
                  #{displayedRangeInfo.endPos}
                </span>{' '}
                su {displayedRangeInfo.total} ingredienti.
              </p>
            )}

            {/* Lista classifica */}
            <ul className="space-y-2 text-xs">
              {displayedLeaderboard.map(row => {
                const globalIndex =
                  leaderboard.findIndex(
                    r => r.ingredientId === row.ingredientId
                  ) + 1;

                return (
                  <li
                    key={row.ingredientId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-8 text-slate-400">
                        #{globalIndex}
                      </span>
                      <Link
                        href={`/stats/ingredients/${row.ingredientId}`}
                        className="flex items-center gap-2 text-slate-100 hover:underline"
                      >
                        <span className="text-lg">
                          {getIngredientEmoji(row.name)}
                        </span>
                        <span className="text-sm">
                          {row.name}
                        </span>
                      </Link>
                    </div>
                    <span className="text-sm font-semibold">
                      {row.count} pizze
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Paginazione per vista "all" */}
            {viewMode === 'all' && pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(p => Math.max(0, p - 1))
                  }
                  disabled={currentPage === 0}
                  className="px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-900 disabled:opacity-50"
                >
                  Pagina precedente
                </button>
                <span className="text-slate-400">
                  Pagina{' '}
                  <span className="font-semibold">
                    {currentPage + 1}
                  </span>{' '}
                  di{' '}
                  <span className="font-semibold">{pageCount}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(p =>
                      Math.min(pageCount - 1, p + 1)
                    )
                  }
                  disabled={currentPage >= pageCount - 1}
                  className="px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-900 disabled:opacity-50"
                >
                  Pagina successiva
                </button>
              </div>
            )}

            <p className="mt-2 text-[11px] text-slate-500">
              La classifica considera tutte le pizze registrate nel periodo
              selezionato in cui l&apos;ingrediente compare almeno una volta.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
