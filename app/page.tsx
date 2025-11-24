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

type RankingEntry = {
  type: 'year2025' | 'currentMonth' | 'weekday' | 'ingredient' | 'bestIngredient';
  label: string;
  rank: number;
  totalUsers: number;
  count?: number;
  ingredientId?: number;
  ingredientName?: string;
};

type IngredientMomentHighlight = {
  ingredientId: number;
  name: string;
  count: number;
};

type IngredientMoments = {
  prevMonth: IngredientMomentHighlight | null;
  currentMonth: IngredientMomentHighlight | null;
  prevWeek: IngredientMomentHighlight | null;
  currentWeek: IngredientMomentHighlight | null;
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

// Mapping ingredienti → emoji
const INGREDIENT_EMOJI_MAP: Record<string, string> = {
  // classici
  'cipolla': '🧅',
  'cipolle': '🧅',
  'salame': '🍖',
  'salame piccante': '🌶️',
  'salamino piccante': '🌶️',
  'salsiccia': '🥩',
  'wurstel': '🌭',
  'wurstel di pollo': '🌭',
  'prosciutto': '🥓',
  'prosciutto cotto': '🥓',
  'prosciutto crudo': '🥓',
  'speck': '🥓',

  // verdure
  'funghi': '🍄',
  'carciofi': '🫒',
  'carciofo': '🫒',
  'zucchine': '🥒',
  'zucchina': '🥒',
  'melanzane': '🍆',
  'melanzana': '🍆',
  'peperoni': '🫑',
  'peperone': '🫑',
  'rucola': '🥬',
  'insalata': '🥬',
  'basilico': '🌿',

  // mare
  'tonno': '🐟',
  'acciughe': '🐟',
  'acciuga': '🐟',
  'gamberi': '🦐',

  // extra
  'olive': '🫒',
  'olive nere': '🫒',
  'olive verdi': '🫒',
  'mais': '🌽',
  'ananas': '🍍',
  'gorgonzola': '🧀',
  'mozzarella di bufala': '🧀',
  'bufala': '🧀',
  'patatine fritte': '🍟',
  'patate fritte': '🍟',
  'patate': '🥔',
  'patate al forno': '🥔',
  'patate arrosto': '🥔',
  'patate lesse': '🥔',
};

function getIngredientEmoji(name?: string | null): string {
  if (!name) return '🍕';
  // normalizziamo un minimo (minuscolo + tolgo accenti)
  let n = name.toLowerCase().trim();
  n = n
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // rimuove accenti tipo 'pèperòni'

  return INGREDIENT_EMOJI_MAP[n] ?? '🍕';
}


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

function IngredientStatCard({
  title,
  subtitle,
  highlight,
}: {
  title: string;
  subtitle: string;
  highlight: IngredientMomentHighlight | null;
}) {
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-3 flex flex-col gap-1 text-xs">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {title}
      </span>
      <span className="text-[11px] text-slate-500">{subtitle}</span>
      {highlight ? (
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg">
              {getIngredientEmoji(highlight.name)}
            </span>
            <Link
              href={`/stats/ingredients/${highlight.ingredientId}`}
              className="text-sm font-semibold text-slate-50 hover:underline"
            >
              {highlight.name}
            </Link>
          </div>
          <span className="text-[11px] text-slate-400">
            {highlight.count} pizze
          </span>
        </div>
      ) : (
        <span className="mt-2 text-[11px] text-slate-500">
          Nessun dato disponibile.
        </span>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [yearRank, setYearRank] = useState<GlobalRank | null>(null);
  const [monthRank, setMonthRank] = useState<GlobalRank | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);

  // Contatori globali in tempo reale
  const [globalPizzasCurrentYear, setGlobalPizzasCurrentYear] = useState<number>(0);
  const [globalIngredientsCurrentYear, setGlobalIngredientsCurrentYear] = useState<number>(0);
  const [loadingGlobalStats, setLoadingGlobalStats] = useState(false);

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

  const [ingredientMoments, setIngredientMoments] = useState<IngredientMoments>({
    prevMonth: null,
    currentMonth: null,
    prevWeek: null,
    currentWeek: null,
  });
  const [loadingIngredientMoments, setLoadingIngredientMoments] = useState(false);

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

  // Highlight globali (posizione anno/mese, top ingredient dell’anno ecc.)
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

        // ========== LOGICA RANKING COMPLETA (come nel profilo) ==========
        const newRankings: RankingEntry[] = [];

        // 1. RANK GLOBALE PER IL 2025 (sempre mostrato)
        if (y === 2025) {
          if (yearRankObj.rank && yearRankObj.totalUsers > 0) {
            newRankings.push({
              type: 'year2025',
              label: 'Pizze mangiate nel 2025',
              rank: yearRankObj.rank,
              totalUsers: yearRankObj.totalUsers,
              count: yearRankObj.count,
            });
          }
        } else {
          // Se non siamo nel 2025, calcola comunque il rank per il 2025
          try {
            const { data: pizzas2025, error: error2025 } = await supabase
              .from('pizzas')
              .select('user_id')
              .gte('eaten_at', '2025-01-01')
              .lte('eaten_at', '2025-12-31');

            if (!error2025 && pizzas2025) {
              const counts: Record<string, number> = {};
              pizzas2025.forEach(row => {
                counts[row.user_id] = (counts[row.user_id] || 0) + 1;
              });

              const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              const totalUsers = entries.length;
              const myIndex = entries.findIndex(([id]) => id === uid);
              const myCount = counts[uid] || 0;

              if (myIndex !== -1) {
                newRankings.push({
                  type: 'year2025',
                  label: 'Pizze mangiate nel 2025',
                  rank: myIndex + 1,
                  totalUsers,
                  count: myCount,
                });
              }
            }
          } catch (e) {
            console.warn('Impossibile calcolare rank 2025', e);
          }
        }

        // 2. RANK GLOBALE PER IL MESE CORRENTE (sempre mostrato)
        if (monthRankObj.rank && monthRankObj.totalUsers > 0) {
          const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
            'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
          newRankings.push({
            type: 'currentMonth',
            label: `Pizze mangiate a ${monthNames[m - 1]} ${y}`,
            rank: monthRankObj.rank,
            totalUsers: monthRankObj.totalUsers,
            count: monthRankObj.count,
          });
        }

        // 3. TOP 10 PER GIORNI DELLA SETTIMANA
        try {
          const weekdayNames = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

          const { data: allPizzasYear, error: errorYear } = await supabase
            .from('pizzas')
            .select('user_id, eaten_at')
            .gte('eaten_at', startYear)
            .lte('eaten_at', endYear);

          if (!errorYear && allPizzasYear) {
            const weekdayCounts: Record<number, Record<string, number>> = {};
            for (let i = 0; i < 7; i++) {
              weekdayCounts[i] = {};
            }

            allPizzasYear.forEach(row => {
              if (!row.eaten_at) return;
              const d = new Date(row.eaten_at);
              if (Number.isNaN(d.getTime())) return;
              const weekday = d.getDay();
              weekdayCounts[weekday][row.user_id] = (weekdayCounts[weekday][row.user_id] || 0) + 1;
            });

            for (let weekday = 0; weekday < 7; weekday++) {
              const counts = weekdayCounts[weekday];
              const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              const myIndex = entries.findIndex(([id]) => id === uid);
              const myCount = counts[uid] || 0;

              if (myIndex !== -1 && myIndex < 10 && myCount > 0) {
                newRankings.push({
                  type: 'weekday',
                  label: `Pizze mangiate di ${weekdayNames[weekday]}`,
                  rank: myIndex + 1,
                  totalUsers: entries.length,
                  count: myCount,
                });
              }
            }
          }
        } catch (e) {
          console.warn('Impossibile calcolare rank per weekday', e);
        }

        // 4. TOP 10 PER INGREDIENTI + 5. MIGLIOR INGREDIENTE
        try {
          // Ottieni le pizze dell'utente nell'anno corrente con ingredienti
          const { data: userYearPizzasData, error: userYearError } = await supabase
            .from('pizzas')
            .select(`
              id,
              pizza_ingredients (
                ingredients (
                  id,
                  name
                )
              )
            `)
            .eq('user_id', uid)
            .gte('eaten_at', startYear)
            .lte('eaten_at', endYear);

          if (userYearError) throw userYearError;

          const freq: Record<number, { name: string; count: number }> = {};
          (userYearPizzasData ?? []).forEach((p: any) => {
            (p.pizza_ingredients ?? []).forEach((pi: any) => {
              const ing = pi.ingredients;
              if (!ing) return;
              const id = ing.id as number;
              if (!freq[id]) {
                freq[id] = { name: ing.name, count: 0 };
              }
              freq[id].count += 1;
            });
          });

          const ingredientRankings: Array<{
            ingredientId: number;
            ingredientName: string;
            rank: number;
            totalUsers: number;
            count: number;
          }> = [];

          for (const [ingredientId, { name, count }] of Object.entries(freq)) {
            const { data: allPi, error: allPiError } = await supabase
              .from('pizza_ingredients')
              .select(`
                pizza_id,
                ingredient_id,
                pizzas!inner (
                  user_id,
                  eaten_at
                )
              `)
              .eq('ingredient_id', Number(ingredientId))
              .gte('pizzas.eaten_at', startYear)
              .lte('pizzas.eaten_at', endYear);

            if (allPiError || !allPi) continue;

            const byUser: Record<string, number> = {};
            allPi.forEach((row: any) => {
              const uid2 = row.pizzas.user_id as string;
              byUser[uid2] = (byUser[uid2] || 0) + 1;
            });

            const entries = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
            const totalUsers = entries.length;
            const myIndex = entries.findIndex(([id]) => id === uid);

            if (myIndex !== -1) {
              ingredientRankings.push({
                ingredientId: Number(ingredientId),
                ingredientName: name,
                rank: myIndex + 1,
                totalUsers,
                count,
              });
            }
          }

          ingredientRankings.sort((a, b) => a.rank - b.rank);

          const top10Ingredients = ingredientRankings.filter(r => r.rank <= 10);
          top10Ingredients.forEach(r => {
            newRankings.push({
              type: 'ingredient',
              label: `Uso dell'ingrediente`,
              rank: r.rank,
              totalUsers: r.totalUsers,
              count: r.count,
              ingredientId: r.ingredientId,
              ingredientName: r.ingredientName,
            });
          });

          if (top10Ingredients.length === 0 && ingredientRankings.length > 0) {
            const best = ingredientRankings[0];
            newRankings.push({
              type: 'bestIngredient',
              label: `Miglior posizione per ingrediente`,
              rank: best.rank,
              totalUsers: best.totalUsers,
              count: best.count,
              ingredientId: best.ingredientId,
              ingredientName: best.ingredientName,
            });
          }
        } catch (e) {
          console.warn('Impossibile calcolare rank per ingredienti', e);
        }

        setRankings(newRankings);

        // ========== CONTATORI GLOBALI ANNO CORRENTE ==========
        setLoadingGlobalStats(true);
        try {
          // Conta tutte le pizze dell'anno corrente
          const { count: pizzasCount, error: pizzasError } = await supabase
            .from('pizzas')
            .select('id', { count: 'exact', head: true })
            .gte('eaten_at', startYear)
            .lte('eaten_at', endYear);

          if (pizzasError) throw pizzasError;
          setGlobalPizzasCurrentYear(pizzasCount ?? 0);

          // Conta gli ingredienti distinti usati nell'anno corrente
          const { data: ingredientsData, error: ingredientsError } = await supabase
            .from('pizza_ingredients')
            .select('ingredient_id, pizzas!inner(eaten_at)')
            .gte('pizzas.eaten_at', startYear)
            .lte('pizzas.eaten_at', endYear);

          if (ingredientsError) throw ingredientsError;

          const uniqueIngredients = new Set<number>();
          (ingredientsData ?? []).forEach((row: any) => {
            if (row.ingredient_id) {
              uniqueIngredients.add(row.ingredient_id);
            }
          });

          setGlobalIngredientsCurrentYear(uniqueIngredients.size);
        } catch (e) {
          console.warn('Impossibile calcolare contatori globali', e);
        } finally {
          setLoadingGlobalStats(false);
        }

      } catch (err) {
        console.error(err);
        // non blocchiamo la home per errori di highlight
      } finally {
        setLoadingHighlights(false);
      }
    };

    loadHighlights();
  }, [user?.id]);

  // Ingredienti del momento (mese scorso / mese corrente / settimana scorsa / settimana corrente)
  // Ingredienti del momento (mese scorso / mese corrente / settimana scorsa / settimana corrente)
  useEffect(() => {
    const loadIngredientMoments = async () => {
      if (!user?.id) return;
      setLoadingIngredientMoments(true);

      try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // helper per normalizzare "YYYY-MM-DD"
        const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

        // Calcolo confini MESI
        const currentMonthStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );
        const currentMonthEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          1
        ); // esclusivo

        const prevMonthIndex =
          now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevMonthYear =
          now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonthStart = new Date(prevMonthYear, prevMonthIndex, 1);
        const prevMonthEnd = new Date(prevMonthYear, prevMonthIndex + 1, 1); // esclusivo

        // Calcolo confini SETTIMANE (consideriamo lunedì come inizio)
        const currentWeekStart = new Date(now);
        const day = currentWeekStart.getDay(); // 0=dom,...6=sab
        const diffToMonday = (day + 6) % 7; // 0->6,1->0,...
        currentWeekStart.setDate(currentWeekStart.getDate() - diffToMonday);
        currentWeekStart.setHours(0, 0, 0, 0);

        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 7); // esclusivo

        const prevWeekStart = new Date(currentWeekStart);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekEnd = new Date(currentWeekStart); // esclusivo

        const isBoringIngredient = (name: string | undefined | null) => {
          if (!name) return true;
          const n = name.toLowerCase().trim();
          return n === 'pomodoro' || n === 'mozzarella';
        };

        // Helper generico: restituisce l'ingrediente top in un intervallo [start, end)
        const getTopIngredientForPeriod = async (
          start: Date,
          end: Date
        ): Promise<IngredientMomentHighlight | null> => {
          const { data, error } = await supabase
            .from('pizza_ingredients')
            .select(
              `
            ingredient_id,
            ingredients ( id, name ),
            pizzas!inner (
              id,
              eaten_at,
              user_id
            )
          `
            )
            .gte('pizzas.eaten_at', toDateOnly(start))
            .lt('pizzas.eaten_at', toDateOnly(end));

          if (error) throw error;

          // contiamo quante PIZZE diverse usano ogni ingrediente
          const counts: Record<
            number,
            { name: string; pizzaIds: Set<number> }
          > = {};

          (data ?? []).forEach((row: any) => {
            const ingId = row.ingredient_id as number;
            const ingName = row.ingredients?.name as string | undefined;
            const pizzaId = row.pizzas?.id as number | undefined;

            if (!ingId || !ingName || !pizzaId) return;
            if (isBoringIngredient(ingName)) return;

            if (!counts[ingId]) {
              counts[ingId] = {
                name: ingName,
                pizzaIds: new Set<number>(),
              };
            }
            counts[ingId].pizzaIds.add(pizzaId);
          });

          const entries = Object.entries(counts);
          if (entries.length === 0) return null;

          entries.sort(
            (a, b) => b[1].pizzaIds.size - a[1].pizzaIds.size
          );

          const [idStr, val] = entries[0];
          return {
            ingredientId: Number(idStr),
            name: val.name,
            count: val.pizzaIds.size,
          };
        };

        const [prevMonthTop, currentMonthTop, prevWeekTop, currentWeekTop] =
          await Promise.all([
            getTopIngredientForPeriod(prevMonthStart, prevMonthEnd),
            getTopIngredientForPeriod(currentMonthStart, currentMonthEnd),
            getTopIngredientForPeriod(prevWeekStart, prevWeekEnd),
            getTopIngredientForPeriod(currentWeekStart, currentWeekEnd),
          ]);

        setIngredientMoments({
          prevMonth: prevMonthTop,
          currentMonth: currentMonthTop,
          prevWeek: prevWeekTop,
          currentWeek: currentWeekTop,
        });
      } catch (err) {
        console.error(
          'Errore nel calcolo degli ingredienti del momento',
          err
        );
      } finally {
        setLoadingIngredientMoments(false);
      }
    };

    loadIngredientMoments();
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

  const now = new Date();
  const currentMonthIndex = now.getMonth();
  const prevMonthIndex = currentMonthIndex === 0 ? 11 : currentMonthIndex - 1;
  const currentMonthName = MONTH_LABELS[currentMonthIndex];
  const prevMonthName = MONTH_LABELS[prevMonthIndex];

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader displayName={displayName} />
      {/* Barra ranking */}
      <section className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-6xl mx-auto">
          {loadingHighlights ? (
            <p className="text-xs text-slate-400">
              Carico le tue statistiche globali...
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
              {/* Colonna sinistra: Ranking personali */}
              <div>
                {rankings.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Nessun posizionamento disponibile al momento. Inizia a registrare le tue pizze!
                  </p>
                ) : (
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    {rankings.map((ranking, idx) => {
                      const showIngredientLink = ranking.type === 'ingredient' || ranking.type === 'bestIngredient';
                      
                      return (
                        <div
                          key={idx}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center gap-2"
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0 ${
                              ranking.rank === 1
                                ? 'bg-yellow-400 text-slate-900'
                                : ranking.rank === 2
                                ? 'bg-slate-300 text-slate-900'
                                : ranking.rank === 3
                                ? 'bg-amber-700 text-slate-50'
                                : 'bg-slate-700 text-slate-100'
                            }`}
                          >
                            {ranking.rank === 1
                              ? '🥇'
                              : ranking.rank === 2
                              ? '🥈'
                              : ranking.rank === 3
                              ? '🥉'
                              : `#${ranking.rank}`}
                          </span>
                          <div className="flex-1 flex items-baseline gap-1 min-w-0">
                            <span className="text-slate-200 text-[10px]">
                              {ranking.label}
                              {showIngredientLink && ranking.ingredientName && ranking.ingredientId && (
                                <>
                                  {' '}
                                  <Link 
                                    href={`/stats/ingredients/${ranking.ingredientId}`}
                                    className="font-semibold text-amber-400 hover:text-amber-300 underline"
                                  >
                                    {ranking.ingredientName}
                                  </Link>
                                </>
                              )}
                              {!showIngredientLink && ':'}
                              {' '}
                              <span className="font-bold text-amber-400">
                                #{ranking.rank}
                              </span>
                              /{ranking.totalUsers}
                              {ranking.count !== undefined && (
                                <span className="text-slate-500">
                                  {' '}• {ranking.count}🍕
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Colonna destra: Contatori globali */}
              <div className="flex flex-col gap-3 min-w-[200px]">
                <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-2 border-amber-500/30 rounded-2xl p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold mb-1">
                    Pizze nel {new Date().getFullYear()}
                  </p>
                  {loadingGlobalStats ? (
                    <p className="text-2xl font-black text-amber-400">...</p>
                  ) : (
                    <p className="text-4xl font-black text-amber-400">
                      {globalPizzasCurrentYear.toLocaleString('it-IT')}
                    </p>
                  )}
                  <p className="text-[9px] text-slate-400 mt-1">🌍 Globale</p>
                </div>

                <div className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-2 border-emerald-500/30 rounded-2xl p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold mb-1">
                    Ingredienti {new Date().getFullYear()}
                  </p>
                  {loadingGlobalStats ? (
                    <p className="text-2xl font-black text-emerald-400">...</p>
                  ) : (
                    <p className="text-4xl font-black text-emerald-400">
                      {globalIngredientsCurrentYear}
                    </p>
                  )}
                  <p className="text-[9px] text-slate-400 mt-1">🌍 Globale</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contenuto centrale con 3 colonne su desktop */}
      <div className="flex-1 px-4 py-4 flex justify-center">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* Colonna sinistra (desktop): mese scorso + settimana scorsa */}
          <div className="hidden md:flex flex-col gap-3">
            {loadingIngredientMoments ? (
              <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-3 text-[11px] text-slate-400">
                Carico i tuoi ingredienti del momento...
              </div>
            ) : (
              <>
                <IngredientStatCard
                  title="Ingrediente del mese scorso"
                  subtitle={prevMonthName}
                  highlight={ingredientMoments.prevMonth}
                />
                <IngredientStatCard
                  title="Ingrediente della settimana scorsa"
                  subtitle="Settimana precedente"
                  highlight={ingredientMoments.prevWeek}
                />
              </>
            )}
          </div>

          {/* Colonna centrale: counter + mobile ingredient panel */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md">
              {/* Versione mobile: ingredienti del momento collassabili sopra al counter */}
              <div className="md:hidden mb-3 w-full">
                <details className="bg-slate-800/70 border border-slate-700 rounded-2xl">
                  <summary className="px-3 py-2 text-xs font-semibold cursor-pointer list-none flex items-center justify-between">
                    <span>Ingredienti del momento</span>
                    <span className="text-[10px] text-slate-400">
                      tocca per aprire
                    </span>
                  </summary>
                  <div className="px-3 pb-3 pt-1">
                    {loadingIngredientMoments ? (
                      <p className="text-[11px] text-slate-400">
                        Carico i tuoi ingredienti del momento...
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                        <IngredientStatCard
                          title="Mese scorso"
                          subtitle={prevMonthName}
                          highlight={ingredientMoments.prevMonth}
                        />
                        <IngredientStatCard
                          title="Mese corrente"
                          subtitle={currentMonthName}
                          highlight={ingredientMoments.currentMonth}
                        />
                        <IngredientStatCard
                          title="Settimana scorsa"
                          subtitle="Settimana precedente"
                          highlight={ingredientMoments.prevWeek}
                        />
                        <IngredientStatCard
                          title="Settimana corrente"
                          subtitle="Questa settimana"
                          highlight={ingredientMoments.currentWeek}
                        />
                      </div>
                    )}
                  </div>
                </details>
              </div>

              {/* Selettore anno + counter */}
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
                    Puoi lasciare 0 se vuoi partire da zero e usare solo il
                    bottone +1.
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

          {/* Colonna destra (desktop): mese corrente + settimana corrente */}
          <div className="hidden md:flex flex-col gap-3">
            {loadingIngredientMoments ? (
              <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-3 text-[11px] text-slate-400">
                Carico i tuoi ingredienti del momento...
              </div>
            ) : (
              <>
                <IngredientStatCard
                  title="Ingrediente del mese corrente"
                  subtitle={currentMonthName}
                  highlight={ingredientMoments.currentMonth}
                />
                <IngredientStatCard
                  title="Ingrediente della settimana corrente"
                  subtitle="Questa settimana"
                  highlight={ingredientMoments.currentWeek}
                />
              </>
            )}
          </div>
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
