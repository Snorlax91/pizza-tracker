'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { PizzaDetailsPanel } from '@/components/PizzaDetailsPanel';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

type User = {
  id: string;
  email?: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  needs_onboarding: boolean;
};

type GlobalRank = {
  rank: number | null;
  totalUsers: number;
  count: number;
};

type Highlight = {
  id: string;
  label: string;
  description: string;
  rank: number;
};

const MONTH_LABELS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];


const CURRENT_YEAR = new Date().getFullYear();

// Hook per gestire contatori annuali (base_count + pizze)
function useYearlyPizzaStats(userId?: string) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [baseCount, setBaseCount] = useState<number>(0);
  const [pizzaCount, setPizzaCount] = useState<number>(0);
  const [loadingCounter, setLoadingCounter] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasYearlyRow, setHasYearlyRow] = useState<boolean>(false);

  const loadCounters = useCallback(async () => {
    if (!userId) return;
    setLoadingCounter(true);
    setErrorMsg(null);

    try {
      const { data: yearly, error: yearlyError } = await supabase
        .from('user_yearly_counters')
        .select('base_count')
        .eq('user_id', userId)
        .eq('year', year)
        .maybeSingle();

      if (yearlyError && yearlyError.code !== 'PGRST116') {
        console.error(yearlyError);
        setErrorMsg('Errore nel caricamento del contatore di base.');
      }

      if (yearly && typeof yearly.base_count === 'number') {
        setBaseCount(yearly.base_count);
        setHasYearlyRow(true);
      } else {
        setBaseCount(0);
        setHasYearlyRow(false);
      }

      const { error: pizzasError, count } = await supabase
        .from('pizzas')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('eaten_at', `${year}-01-01`)
        .lte('eaten_at', `${year}-12-31`);

      if (pizzasError) {
        console.error(pizzasError);
        setErrorMsg('Errore nel conteggio delle pizze.');
      }

      setPizzaCount(count ?? 0);
    } catch (err) {
      console.error(err);
      setErrorMsg('Errore nel caricamento dei dati.');
    } finally {
      setLoadingCounter(false);
    }
  }, [userId, year]);

  useEffect(() => {
    if (userId) {
      loadCounters();
    }
  }, [userId, loadCounters]);

  return {
    year,
    setYear,
    baseCount,
    setBaseCount,
    pizzaCount,
    setPizzaCount,
    loadingCounter,
    errorMsg,
    setErrorMsg,
    hasYearlyRow,
    setHasYearlyRow,
    reload: loadCounters,
  };
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [yearRank, setYearRank] = useState<GlobalRank | null>(null);
  const [monthRank, setMonthRank] = useState<GlobalRank | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);

  const {
    year,
    setYear,
    baseCount,
    setBaseCount,
    pizzaCount,
    setPizzaCount,
    loadingCounter,
    errorMsg,
    setErrorMsg,
    hasYearlyRow,
    setHasYearlyRow,
  } = useYearlyPizzaStats(user?.id);

  const [adding, setAdding] = useState(false);
  const [lastAddedPizzaId, setLastAddedPizzaId] = useState<number | null>(
    null
  );
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  const [initialCountInput, setInitialCountInput] = useState<number>(0);
  const [savingInitialCount, setSavingInitialCount] = useState(false);

  const total = baseCount + pizzaCount;

  // Carica utente + profilo + gestisce onboarding
  useEffect(() => {
    const loadUserAndProfile = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setUser(null);
        setLoadingUser(false);
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

      if (profileError) {
        console.error(profileError);
        setUser(null);
        setLoadingUser(false);
        router.push('/auth');
        return;
      }

      if (profile.needs_onboarding) {
        setUser({ id: user.id, email: user.email ?? undefined });
        setProfile(profile as Profile);
        setLoadingUser(false);
        router.push('/onboarding');
        return;
      }

      setUser({ id: user.id, email: user.email ?? undefined });
      setProfile(profile as Profile);
      setLoadingUser(false);
    };

    loadUserAndProfile();
  }, [router]);

  useEffect(() => {
    const loadHighlights = async () => {
      if (!user?.id) return;
      setLoadingHighlights(true);

      try {
        const uid = user.id;
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;

        const startYear = `${y}-01-01`;
        const endYear = `${y}-12-31`;

        const startMonth = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endMonth = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

        // 🔢 CLASSIFICA GLOBALE ANNUALE
        const { data: yearPizzas, error: yearError } = await supabase
          .from('pizzas')
          .select('user_id')
          .gte('eaten_at', startYear)
          .lte('eaten_at', endYear);

        if (yearError) throw yearError;

        const yearCounts: Record<string, number> = {};
        (yearPizzas ?? []).forEach((row: any) => {
          yearCounts[row.user_id] = (yearCounts[row.user_id] || 0) + 1;
        });

        const yearEntries = Object.entries(yearCounts).sort(
          (a, b) => b[1] - a[1]
        );
        const yearTotalUsers = yearEntries.length;
        const yearIndex = yearEntries.findIndex(([id]) => id === uid);
        const yearCount = yearCounts[uid] || 0;

        const yearRankObj: GlobalRank = {
          rank: yearIndex === -1 ? null : yearIndex + 1,
          totalUsers: yearTotalUsers,
          count: yearCount,
        };
        setYearRank(yearRankObj);

        // 🔢 CLASSIFICA GLOBALE MENSILE
        const { data: monthPizzas, error: monthError } = await supabase
          .from('pizzas')
          .select('user_id')
          .gte('eaten_at', startMonth)
          .lte('eaten_at', endMonth);

        if (monthError) throw monthError;

        const monthCounts: Record<string, number> = {};
        (monthPizzas ?? []).forEach((row: any) => {
          monthCounts[row.user_id] = (monthCounts[row.user_id] || 0) + 1;
        });

        const monthEntries = Object.entries(monthCounts).sort(
          (a, b) => b[1] - a[1]
        );
        const monthTotalUsers = monthEntries.length;
        const monthIndex = monthEntries.findIndex(([id]) => id === uid);
        const monthCount = monthCounts[uid] || 0;

        const monthRankObj: GlobalRank = {
          rank: monthIndex === -1 ? null : monthIndex + 1,
          totalUsers: monthTotalUsers,
          count: monthCount,
        };
        setMonthRank(monthRankObj);

        // 🌶 HIGHLIGHT PER INGREDIENTE – anno corrente
        const { data: userYearPizzas, error: userYearError } = await supabase
          .from('pizzas')
          .select(
            `
          id,
          pizza_ingredients (
            ingredients (
              id,
              name
            )
          )
        `
          )
          .eq('user_id', uid)
          .gte('eaten_at', startYear)
          .lte('eaten_at', endYear);

        if (userYearError) throw userYearError;

        const ingFreq: Record<number, { name: string; count: number }> = {};
        (userYearPizzas ?? []).forEach((p: any) => {
          (p.pizza_ingredients ?? []).forEach((pi: any) => {
            const ing = pi.ingredients;
            if (!ing) return;
            const id = ing.id as number;
            if (!ingFreq[id]) {
              ingFreq[id] = { name: ing.name as string, count: 0 };
            }
            ingFreq[id].count += 1;
          });
        });

        const ingSorted = Object.entries(ingFreq)
          .map(([id, val]) => ({
            id: Number(id),
            name: val.name,
            count: val.count,
          }))
          .sort((a, b) => b.count - a.count);

        const newHighlights: Highlight[] = [];

        // Highlight: Top 10 globale per pizze ANNO
        if (
          yearRankObj.rank &&
          yearRankObj.rank <= 10 &&
          yearRankObj.totalUsers > 0
        ) {
          newHighlights.push({
            id: 'year-pizzas',
            label: `Top ${yearRankObj.rank} per pizze ${y}`,
            description: `Hai registrato ${yearRankObj.count} pizze nel ${y}.`,
            rank: yearRankObj.rank,
          });
        }

        // Highlight: Top 10 globale per pizze MESE
        if (
          monthRankObj.rank &&
          monthRankObj.rank <= 10 &&
          monthRankObj.totalUsers > 0
        ) {
          const monthLabel = MONTH_LABELS[m - 1] ?? `${m}`;
          newHighlights.push({
            id: 'month-pizzas',
            label: `Top ${monthRankObj.rank} a ${monthLabel}`,
            description: `Questo mese hai registrato ${monthRankObj.count} pizze.`,
            rank: monthRankObj.rank,
          });
        }

        // Highlight: Top 10 per ingrediente (più usato dell'anno)
        if (ingSorted.length > 0) {
          const fav = ingSorted[0];

          const { data: allPi, error: allPiError } = await supabase
            .from('pizza_ingredients')
            .select(
              `
            pizza_id,
            ingredient_id,
            pizzas!inner (
              user_id,
              eaten_at
            )
          `
            )
            .eq('ingredient_id', fav.id)
            .gte('pizzas.eaten_at', startYear)
            .lte('pizzas.eaten_at', endYear);

          if (allPiError) throw allPiError;

          const byUser: Record<string, number> = {};
          (allPi ?? []).forEach((row: any) => {
            const uid2 = row.pizzas.user_id as string;
            byUser[uid2] = (byUser[uid2] || 0) + 1;
          });

          const entries = Object.entries(byUser).sort(
            (a, b) => b[1] - a[1]
          );
          const idx = entries.findIndex(([id]) => id === uid);
          const rank = idx === -1 ? null : idx + 1;
          const count = byUser[uid] || 0;

          if (rank && rank <= 10) {
            newHighlights.push({
              id: 'ingredient-year',
              label: `Top ${rank} per ${fav.name}`,
              description: `Hai mangiato ${count} pizze con ${fav.name} nel ${y}.`,
              rank,
            });
          }
        }

        setHighlights(newHighlights);
      } catch (err) {
        console.error(err);
        // non blocchiamo la home per errori di highlight
      } finally {
        setLoadingHighlights(false);
      }
    };

    loadHighlights();
  }, [user?.id]);

  const handleUndoLastPizza = async () => {
    if (!user) return;
    setUndoLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('pizzas')
        .select('id, eaten_at')
        .eq('user_id', user.id)
        .gte('eaten_at', `${year}-01-01`)
        .lte('eaten_at', `${year}-12-31`)
        .order('eaten_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        setErrorMsg('Non ci sono pizze da annullare per questo anno.');
        setUndoLoading(false);
        return;
      }

      const last = data[0];

      // elimina ingredienti
      await supabase.from('pizza_ingredients').delete().eq('pizza_id', last.id);
      // elimina pizza
      const { error: delError } = await supabase
        .from('pizzas')
        .delete()
        .eq('id', last.id)
        .eq('user_id', user.id);

      if (delError) throw delError;

      setPizzaCount(prev => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’annullamento dell’ultima pizza.');
    } finally {
      setUndoLoading(false);
    }
  };

  const handleAddPizza = async () => {
    if (!user) return;
    setAdding(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('pizzas')
        .insert({
          user_id: user.id,
          has_details: false,
        })
        .select('id')
        .single();

      if (error) {
        console.error(error);
        setErrorMsg('Errore durante l’aggiunta della pizza.');
        return;
      }

      setPizzaCount(prev => prev + 1);

      if (data?.id) {
        setLastAddedPizzaId(data.id);
        setShowDetailsPanel(true);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Errore inatteso durante l’aggiunta.');
    } finally {
      setAdding(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  const handleSaveInitialCount = async () => {
    if (!user) return;
    setSavingInitialCount(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from('user_yearly_counters')
        .upsert(
          {
            user_id: user.id,
            year,
            base_count: initialCountInput,
          },
          { onConflict: 'user_id,year' }
        );

      if (error) {
        console.error(error);
        setErrorMsg('Errore nel salvataggio del contatore iniziale.');
        return;
      }

      setBaseCount(initialCountInput);
      setHasYearlyRow(true);
    } catch (err) {
      console.error(err);
      setErrorMsg('Errore inatteso nel salvataggio del contatore iniziale.');
    } finally {
      setSavingInitialCount(false);
    }
  };

  if (loadingUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p>Caricamento utente...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p>Reindirizzamento alla pagina di accesso...</p>
      </main>
    );
  }

  const showInitialSetup =
    !loadingCounter && !hasYearlyRow && year === CURRENT_YEAR;

  const displayName =
    profile?.display_name || profile?.username || user.email || 'Tu';

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader displayName={displayName} />
      {/* Barra highlight profilo */}
      <section className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        {loadingHighlights ? (
          <p className="text-xs text-slate-400">
            Carico le tue statistiche globali...
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Posizione mese/anno */}
            <div className="flex flex-wrap gap-2 text-xs">
              {/* ANNO */}
              <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${yearRank?.rank === 1
                    ? 'bg-yellow-400 text-slate-900'
                    : yearRank?.rank === 2
                      ? 'bg-slate-300 text-slate-900'
                      : yearRank?.rank === 3
                        ? 'bg-amber-700 text-slate-50'
                        : 'bg-slate-700 text-slate-100'
                    }`}
                >
                  {yearRank?.rank ? `#${yearRank.rank}` : 'N/D'}
                </span>
                <div className="flex flex-col">
                  <span className="text-slate-200">
                    {yearRank?.rank && yearRank.totalUsers > 0 ? (
                      <>Posizione globale {new Date().getFullYear()}</>
                    ) : (
                      <>Ancora nessuna pizza registrata quest&apos;anno</>
                    )}
                  </span>
                  {yearRank?.rank && yearRank.totalUsers > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {yearRank.count} pizze • su {yearRank.totalUsers} utenti
                    </span>
                  )}
                </div>
              </div>

              {/* MESE */}
              <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${monthRank?.rank === 1
                    ? 'bg-yellow-400 text-slate-900'
                    : monthRank?.rank === 2
                      ? 'bg-slate-300 text-slate-900'
                      : monthRank?.rank === 3
                        ? 'bg-amber-700 text-slate-50'
                        : 'bg-slate-700 text-slate-100'
                    }`}
                >
                  {monthRank?.rank ? `#${monthRank.rank}` : 'N/D'}
                </span>
                <div className="flex flex-col">
                  <span className="text-slate-200">
                    {monthRank?.rank && monthRank.totalUsers > 0 ? (
                      <>
                        Posizione globale{' '}
                        {MONTH_LABELS[new Date().getMonth()]}
                      </>
                    ) : (
                      <>Ancora nessuna pizza registrata questo mese</>
                    )}
                  </span>
                  {monthRank?.rank && monthRank.totalUsers > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {monthRank.count} pizze • su {monthRank.totalUsers} utenti
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Highlight speciali (Top 10 ecc.) */}
            {highlights.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {highlights.map(h => (
                  <div
                    key={h.id}
                    className="px-3 py-1.5 rounded-full border flex items-center gap-2 bg-slate-800/80 border-slate-700"
                  >
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.rank === 1
                        ? 'bg-yellow-400 text-slate-900'
                        : h.rank === 2
                          ? 'bg-slate-300 text-slate-900'
                          : h.rank === 3
                            ? 'bg-amber-700 text-slate-50'
                            : 'bg-slate-700 text-slate-100'
                        }`}
                    >
                      {h.rank === 1
                        ? '🥇'
                        : h.rank === 2
                          ? '🥈'
                          : h.rank === 3
                            ? '🥉'
                            : `#${h.rank}`}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-slate-50 font-semibold">
                        {h.label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {h.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>


      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => setYear(y => y - 1)}
              className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
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
            >
              ▶
            </button>
          </div>

          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-5 mb-4">
            <p className="text-sm text-slate-400 mb-1">
              Pizze mangiate nel {year}
            </p>
            <p className="text-5xl font-black mb-2">
              {loadingCounter ? '...' : total}
            </p>
            <p className="text-xs text-slate-400">
              Di cui {baseCount} già mangiate prima di usare l’app e{' '}
              {pizzaCount} registrate qui.
            </p>
          </div>

          {errorMsg && (
            <p className="mb-3 text-sm text-red-400">{errorMsg}</p>
          )}

          <button
            onClick={handleAddPizza}
            disabled={adding || loadingCounter}
            className="w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold text-xl shadow-lg shadow-amber-500/30 hover:bg-amber-300 transition disabled:opacity-60 disabled:cursor-not-allowed mb-3"
          >
            {adding ? 'Aggiungo...' : '+1 Pizza'}
          </button>

          <button
            type="button"
            onClick={handleUndoLastPizza}
            disabled={undoLoading || loadingCounter}
            className="mt-1 w-full py-2 rounded-xl text-xs border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {undoLoading ? 'Annullo...' : 'Annulla ultima pizza'}
          </button>


          {showInitialSetup && (
            <div className="mt-4 bg-slate-800/70 border border-amber-500/60 rounded-2xl p-4">
              <p className="text-sm font-semibold mb-2">
                Partenza veloce per il {year}
              </p>
              <p className="text-xs text-slate-300 mb-3">
                Quante pizze avevi già mangiato nel {year} prima di usare
                Pizza Tracker? Questo numero verrà aggiunto al conteggio.
              </p>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="number"
                  min={0}
                  value={initialCountInput}
                  onChange={e =>
                    setInitialCountInput(
                      Number.isNaN(parseInt(e.target.value))
                        ? 0
                        : parseInt(e.target.value, 10)
                    )
                  }
                  className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSaveInitialCount}
                  disabled={savingInitialCount}
                  className="px-4 py-2 rounded-xl bg-amber-400 text-slate-900 text-sm font-semibold hover:bg-amber-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingInitialCount ? 'Salvo...' : 'Imposta'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Puoi lasciare 0 se vuoi partire da zero e usare solo il bottone
                +1.
              </p>
            </div>
          )}

          {!showInitialSetup && (
            <p className="text-xs text-slate-500 text-center mt-2">
              Dopo ogni +1 potrai aggiungere foto, ingredienti e dettagli
              della pizza.
            </p>
          )}
        </div>
      </div>

      {/* Modale dettagli pizza se esiste */}
      {showDetailsPanel && lastAddedPizzaId !== null && (
        // @ts-ignore - già definito altrove
        <PizzaDetailsPanel
          pizzaId={lastAddedPizzaId}
          userId={user.id}
          onClose={() => setShowDetailsPanel(false)}
          onUpdated={() => {
            // eventuale logica futura
          }}
        />
      )}
    </main>
  );
}
