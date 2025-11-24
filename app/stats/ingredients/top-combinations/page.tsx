'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';
import { getIngredientEmoji } from '@/lib/ingredientEmojis';

type CombinationRow = {
  ingredients: Array<{ id: number; name: string }>;
  count: number;
};

type ViewMode = 'top' | 'all';

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 50;

export default function TopCombinationsPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState<number | 'all'>('all');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [combinations, setCombinations] = useState<CombinationRow[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('top');
  const [currentPage, setCurrentPage] = useState(0);

  // Carica combinazioni per il periodo selezionato
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      setCombinations([]);
      setViewMode('top');
      setCurrentPage(0);

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
            pizza_id,
            ingredients ( id, name ),
            pizzas!inner (
              eaten_at
            )
          `
          )
          .gte('pizzas.eaten_at', startDate)
          .lte('pizzas.eaten_at', endDate);

        if (error) throw error;

        // Raggruppa ingredienti per pizza_id
        const pizzaIngredientsMap: Record<number, Array<{ id: number; name: string }>> = {};

        (data ?? []).forEach((row: any) => {
          const pizzaId = row.pizza_id as number;
          const ingId = row.ingredient_id as number;
          const ingName = row.ingredients?.name as string | undefined;

          if (!pizzaId || !ingId || !ingName) return;

          if (!pizzaIngredientsMap[pizzaId]) {
            pizzaIngredientsMap[pizzaId] = [];
          }

          // Evita duplicati nello stesso array
          const exists = pizzaIngredientsMap[pizzaId].some(ing => ing.id === ingId);
          if (!exists) {
            pizzaIngredientsMap[pizzaId].push({
              id: ingId,
              name: ingName,
            });
          }
        });

        // Conta le combinazioni (ordinando gli ID per consistenza)
        const combinationCounts: Map<string, { ingredients: Array<{ id: number; name: string }>; count: number }> = new Map();

        Object.values(pizzaIngredientsMap).forEach(ingredients => {
          if (ingredients.length < 2) return; // Ignora pizze con meno di 2 ingredienti

          // Ordina per ID per avere una chiave consistente
          const sorted = [...ingredients].sort((a, b) => a.id - b.id);
          const key = sorted.map(ing => ing.id).join(',');

          if (!combinationCounts.has(key)) {
            combinationCounts.set(key, { ingredients: sorted, count: 0 });
          }
          combinationCounts.get(key)!.count += 1;
        });

        // Converti in array e ordina per conteggio
        const combos: CombinationRow[] = Array.from(combinationCounts.values())
          .filter(combo => combo.count >= 1) // Mostra tutte le combinazioni
          .sort((a, b) => b.count - a.count);

        setCombinations(combos);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nel caricamento delle combinazioni.'
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

  const displayed = useMemo(() => {
    if (viewMode === 'top') {
      return combinations.slice(0, 100);
    }
    const start = currentPage * PAGE_SIZE;
    return combinations.slice(start, start + PAGE_SIZE);
  }, [combinations, viewMode, currentPage]);

  const totalPages = Math.ceil(combinations.length / PAGE_SIZE);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold">
            Top combinazioni di ingredienti
          </h1>
          <Link
            href="/stats"
            className="text-xs px-3 py-1.5 rounded-full border border-slate-600 hover:bg-slate-800"
          >
            ← Torna alle statistiche
          </Link>
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
                  e.target.value === 'all' ? 'all' : Number(e.target.value)
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

        {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

        {loading ? (
          <p className="text-sm text-slate-300">
            Carico le combinazioni...
          </p>
        ) : combinations.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nessuna combinazione trovata per il periodo selezionato ({periodLabel}).
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-300">Visualizzazione:</span>
              <button
                onClick={() => {
                  setViewMode('top');
                  setCurrentPage(0);
                }}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  viewMode === 'top'
                    ? 'bg-amber-400 text-slate-900 border-amber-400 font-semibold'
                    : 'border-slate-600 hover:bg-slate-800'
                }`}
              >
                Top 100
              </button>
              <button
                onClick={() => {
                  setViewMode('all');
                  setCurrentPage(0);
                }}
                className={`px-3 py-1.5 rounded-full border transition-colors ${
                  viewMode === 'all'
                    ? 'bg-amber-400 text-slate-900 border-amber-400 font-semibold'
                    : 'border-slate-600 hover:bg-slate-800'
                }`}
              >
                Tutte ({combinations.length})
              </button>
            </div>

            <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
              <p className="text-xs text-slate-400 mb-3">
                Combinazioni di ingredienti trovate nelle pizze per il periodo{' '}
                <span className="font-semibold text-slate-300">
                  {periodLabel}
                </span>
                . Sono mostrate solo le combinazioni con almeno 2 ingredienti.
              </p>

              {displayed.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nessuna combinazione in questa pagina.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {displayed.map((combo, idx) => {
                    const globalIdx =
                      viewMode === 'top'
                        ? idx
                        : currentPage * PAGE_SIZE + idx;

                    return (
                      <li
                        key={globalIdx}
                        className="flex items-center justify-between gap-3 py-2 border-b border-slate-700 last:border-0"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="w-8 text-right text-slate-500 flex-shrink-0">
                            #{globalIdx + 1}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {combo.ingredients.map((ing, ingIdx) => (
                              <span key={ing.id} className="flex items-center gap-1 min-w-0">
                                {ingIdx > 0 && (
                                  <span className="text-slate-500">+</span>
                                )}
                                <Link
                                  href={`/stats/ingredients/${ing.id}`}
                                  className="flex items-center gap-1 text-slate-100 hover:underline"
                                >
                                  <span className="text-base">
                                    {getIngredientEmoji(ing.name)}
                                  </span>
                                  <span>{ing.name}</span>
                                </Link>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-slate-300 font-semibold">
                            {combo.count}
                          </span>
                          <span className="text-slate-500 ml-1">
                            {combo.count === 1 ? 'pizza' : 'pizze'}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {viewMode === 'all' && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-3 py-1.5 rounded-full border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                  >
                    ◀ Prev
                  </button>
                  <span className="text-xs text-slate-300">
                    Pagina {currentPage + 1} di {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage(p => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={currentPage >= totalPages - 1}
                    className="px-3 py-1.5 rounded-full border border-slate-700 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                  >
                    Next ▶
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
