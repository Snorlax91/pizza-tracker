'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { useRouter } from 'next/navigation';
import { getIngredientEmoji } from '@/lib/ingredientEmojis';
import { LoginPromptModal } from '@/components/LoginPromptModal';

type IngredientStat = {
    id: number;
    name: string;
    count: number;
    avgRating: number | null;
};

type CombinationStat = {
    ingredients: Array<{ id: number; name: string }>;
    count: number;
};

type PizzaOriginFilter =
    | 'all'
    | 'takeaway'
    | 'frozen'
    | 'restaurant'
    | 'bakery'
    | 'bar'
    | 'other'
    | 'unspecified';

type PizzaPeriodRow = {
    eaten_at: string | null;
    user_id: string;
    origin: string | null;
};

type IngredientRow = {
    ingredient_id: number;
    ingredient_name: string;
    rating: number | null;
    pizza_id: number;
    user_id: string;
    eaten_at: string | null;
};

type ProfileLite = {
    id: string;
    username: string | null;
    display_name: string | null;
};

type UserCountStat = {
    userId: string;
    count: number;
};

type UserDistinctStat = {
    userId: string;
    avgDistinct: number;
    pizzaCount: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const WEEKDAY_LABELS_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const WEEKDAY_LABELS_SHORT = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];


export default function GlobalStatsPage() {
    const router = useRouter();

    const [user, setUser] = useState<any>(null);
    const [year, setYear] = useState(CURRENT_YEAR);
    const [month, setMonth] = useState<number | 'all'>('all'); // 1-12 o 'all'
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showLoginModal, setShowLoginModal] = useState(false);

    const [rows, setRows] = useState<IngredientRow[]>([]);
    const [pizzasPeriod, setPizzasPeriod] = useState<PizzaPeriodRow[]>([]);
    const [originFilter, setOriginFilter] = useState<PizzaOriginFilter>('all');
    const [showUnspecified, setShowUnspecified] = useState(false);

    // profili globali per dare un nome alle classifiche utenti
    const [profilesMap, setProfilesMap] = useState<Record<string, ProfileLite>>({});

    // selezioni specifiche per alcune card
    const [usersWeekday, setUsersWeekday] = useState<number>(1); // 1 = lunedì
    const [ingredientsWeekday, setIngredientsWeekday] = useState<number>(1);

    // Check user authentication
    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        checkUser();
    }, []);

    // caricamento dati base (pizze + ingredienti) per periodo globale
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setErrorMsg(null);

            try {
                // Intervallo di date
                const startDate =
                    month === 'all'
                        ? `${year}-01-01`
                        : `${year}-${String(month).padStart(2, '0')}-01`;

                const endDate = (() => {
                    if (month === 'all') return `${year}-12-31`;
                    const lastDay = new Date(year, Number(month), 0).getDate();
                    return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
                })();

                // 1) Statistiche ingredienti (con pizza_id e user_id)
                const { data, error } = await supabase
                    .from('pizza_ingredients')
                    .select(
                        `
            ingredient_id,
            pizza_id,
            ingredients ( id, name ),
            pizzas!inner (
              id,
              user_id,
              eaten_at,
              rating
            )
          `
                    )
                    .gte('pizzas.eaten_at', startDate)
                    .lte('pizzas.eaten_at', endDate);

                if (error) throw error;

                const mapped: IngredientRow[] =
                    data?.map((row: any) => ({
                        ingredient_id: row.ingredient_id as number,
                        ingredient_name: row.ingredients?.name as string,
                        rating:
                            typeof row.pizzas?.rating === 'number'
                                ? (row.pizzas.rating as number)
                                : null,
                        pizza_id: row.pizza_id as number,
                        user_id: row.pizzas?.user_id as string,
                        eaten_at: (row.pizzas?.eaten_at as string) ?? null,
                    })) ?? [];

                setRows(mapped);

                // 2) Pizze del periodo per grafici globali
                const { data: pizzasData, error: pizzasError } = await supabase
                    .from('pizzas')
                    .select('eaten_at, user_id, origin')
                    .gte('eaten_at', startDate)
                    .lte('eaten_at', endDate);

                if (pizzasError) throw pizzasError;

                const mappedPizzas: PizzaPeriodRow[] =
                    (pizzasData ?? []).map((row: any) => ({
                        eaten_at: (row.eaten_at as string) ?? null,
                        user_id: row.user_id as string,
                        origin: (row.origin as string | null) ?? null,
                    }));

                setPizzasPeriod(mappedPizzas);
            } catch (err: any) {
                console.error(err);
                setErrorMsg(
                    err.message ??
                    'Errore nel caricamento delle statistiche globali.'
                );
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [year, month]);

    // carica profili per tutti gli user_id coinvolti nel periodo
    useEffect(() => {
        const loadProfiles = async () => {
            const ids = Array.from(
                new Set(pizzasPeriod.map(p => p.user_id).filter(Boolean))
            );
            if (ids.length === 0) {
                setProfilesMap({});
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .in('id', ids);

                if (error) throw error;

                const map: Record<string, ProfileLite> = {};
                (data ?? []).forEach((p: any) => {
                    map[p.id] = {
                        id: p.id as string,
                        username: p.username as string | null,
                        display_name: p.display_name as string | null,
                    };
                });
                setProfilesMap(map);
            } catch (err) {
                console.error('Errore nel caricare i profili per le stats globali', err);
            }
        };

        if (pizzasPeriod.length > 0) {
            loadProfiles();
        } else {
            setProfilesMap({});
        }
    }, [pizzasPeriod]);

    const {
        topByCount,
        topByRating,
        weekdaySeries,
        weekdayMax,
        pieSeries,
        weeklyAvgSeries,
        weeklyAvgMax,
        topUsersByCount,
        topUsersByWeekday,
        topUsersByDistinct,
        topIngredientsByWeekday,
        topCombinations,
    } = useMemo(() => {
        // Ingredienti: conteggio + voto medio
        let topByCount: IngredientStat[] = [];
        let topByRating: IngredientStat[] = [];

        if (rows && rows.length > 0) {
            const byId: Record<
                number,
                { name: string; count: number; sumRating: number; ratingCount: number }
            > = {};

            rows.forEach(row => {
                if (!row.ingredient_id || !row.ingredient_name) return;
                const id = row.ingredient_id;
                if (!byId[id]) {
                    byId[id] = {
                        name: row.ingredient_name,
                        count: 0,
                        sumRating: 0,
                        ratingCount: 0,
                    };
                }
                byId[id].count += 1;
                if (typeof row.rating === 'number') {
                    byId[id].sumRating += row.rating;
                    byId[id].ratingCount += 1;
                }
            });

            const allStats: IngredientStat[] = Object.entries(byId).map(
                ([id, val]) => ({
                    id: Number(id),
                    name: val.name,
                    count: val.count,
                    avgRating:
                        val.ratingCount > 0
                            ? val.sumRating / val.ratingCount
                            : null,
                })
            );

            topByCount = [...allStats]
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            topByRating = [...allStats]
                .filter(s => s.count >= 5 && s.avgRating !== null)
                .sort((a, b) => (b.avgRating! - a.avgRating!))
                .slice(0, 10);
        }

        // Calcolo delle combinazioni di ingredienti più usate
        let topCombinations: CombinationStat[] = [];
        if (rows && rows.length > 0) {
            // Raggruppa ingredienti per pizza_id
            const pizzaIngredientsMap: Record<number, Array<{ id: number; name: string }>> = {};
            
            rows.forEach(row => {
                if (!row.pizza_id || !row.ingredient_id || !row.ingredient_name) return;
                if (!pizzaIngredientsMap[row.pizza_id]) {
                    pizzaIngredientsMap[row.pizza_id] = [];
                }
                // Evita duplicati nello stesso array
                const exists = pizzaIngredientsMap[row.pizza_id].some(ing => ing.id === row.ingredient_id);
                if (!exists) {
                    pizzaIngredientsMap[row.pizza_id].push({
                        id: row.ingredient_id,
                        name: row.ingredient_name,
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
            topCombinations = Array.from(combinationCounts.values())
                .filter(combo => combo.count >= 2) // Solo combinazioni usate almeno 2 volte
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
        }

        // Se non ci sono pizze nel periodo
        if (!pizzasPeriod || pizzasPeriod.length === 0) {
            return {
                topByCount,
                topByRating,
                topCombinations,
                weekdaySeries: Array(7).fill(0) as number[],
                weekdayMax: 0,
                pieSeries: [] as { label: string; value: number }[],
                weeklyAvgSeries: [] as { week: number; avg: number }[],
                weeklyAvgMax: 0,
                topUsersByCount: [] as UserCountStat[],
                topUsersByWeekday: [] as UserCountStat[],
                topUsersByDistinct: [] as UserDistinctStat[],
                topIngredientsByWeekday: [] as IngredientStat[],
            };
        }

        // Mappatura origin -> label per UI
        const originLabel = (o: PizzaOriginFilter | string | null) => {
            switch (o) {
                case 'takeaway':
                    return 'Da asporto';
                case 'frozen':
                    return 'Surgelata';
                case 'restaurant':
                    return 'Ristorante';
                case 'bakery':
                    return 'Panificio';
                case 'bar':
                    return 'Bar';
                case 'other':
                    return 'Altro';
                case 'unspecified':
                    return 'Non specificato';
                default:
                    return 'Altro';
            }
        };

        // Giorno settimana per provenienza
        const countsByOrigin: Record<PizzaOriginFilter, number[]> = {
            all: Array(7).fill(0),
            takeaway: Array(7).fill(0),
            frozen: Array(7).fill(0),
            restaurant: Array(7).fill(0),
            bakery: Array(7).fill(0),
            bar: Array(7).fill(0),
            other: Array(7).fill(0),
            unspecified: Array(7).fill(0),
        };

        const pieCounts: Record<PizzaOriginFilter, number> = {
            all: 0,
            takeaway: 0,
            frozen: 0,
            restaurant: 0,
            bakery: 0,
            bar: 0,
            other: 0,
            unspecified: 0,
        };

        // Per media pizze / utente / settimana
        const weeksMap: Record<
            number,
            { count: number; users: Set<string> }
        > = {};

        // Per stats utenti
        const userPizzaTotal: Record<string, number> = {};
        const userWeekdayCounts: Record<string, number> = {}; // per giorno selezionato in usersWeekday

        // Inizio periodo (per calcolare settimana 1,2,3...)
        const startDate =
            month === 'all'
                ? new Date(year, 0, 1)
                : new Date(year, Number(month) - 1, 1);
        startDate.setHours(0, 0, 0, 0);
        const msInWeek = 7 * 24 * 60 * 60 * 1000;

        pizzasPeriod.forEach(row => {
            if (!row.eaten_at) return;
            const d = new Date(row.eaten_at);
            if (Number.isNaN(d.getTime())) return;

            const weekday = d.getDay(); // 0-6
            let origin: PizzaOriginFilter = 'other';
            
            // Gestione speciale per null
            if (row.origin === null) {
                origin = 'unspecified';
            } else {
                switch (row.origin) {
                    case 'takeaway':
                    case 'frozen':
                    case 'restaurant':
                    case 'bakery':
                    case 'bar':
                    case 'other':
                        origin = row.origin;
                        break;
                    default:
                        origin = 'other';
                }
            }

            countsByOrigin.all[weekday] += 1;
            countsByOrigin[origin][weekday] += 1;
            pieCounts[origin] += 1;

            // user pizza totals
            const uid = row.user_id;
            if (uid) {
                userPizzaTotal[uid] = (userPizzaTotal[uid] || 0) + 1;

                // conteggio per giorno selezionato per card "Utenti per giorno"
                if (weekday === usersWeekday) {
                    userWeekdayCounts[uid] = (userWeekdayCounts[uid] || 0) + 1;
                }
            }

            // settimana relativa
            const dayOnly = new Date(d);
            dayOnly.setHours(0, 0, 0, 0);
            const diff = dayOnly.getTime() - startDate.getTime();
            if (diff < 0) return;
            const weekIndex = Math.floor(diff / msInWeek) + 1;

            if (!weeksMap[weekIndex]) {
                weeksMap[weekIndex] = {
                    count: 0,
                    users: new Set<string>(),
                };
            }
            weeksMap[weekIndex].count += 1;
            if (uid) {
                weeksMap[weekIndex].users.add(uid);
            }
        });

        const weekdaySeries = countsByOrigin[originFilter];
        const weekdayMax = Math.max(...weekdaySeries, 0);

        const pieSeries = (
            ['takeaway', 'frozen', 'restaurant', 'bakery', 'bar', 'other', 'unspecified'] as PizzaOriginFilter[]
        )
            .filter(key => showUnspecified || key !== 'unspecified')
            .map(key => ({
                key,
                label: originLabel(key),
                value: pieCounts[key],
            }))
            .filter(item => item.value > 0);

        const weeklyAvgSeries = Object.entries(weeksMap)
            .map(([week, data]) => {
                const usersCount = data.users.size || 1;
                return {
                    week: Number(week),
                    avg: data.count / usersCount,
                };
            })
            .sort((a, b) => a.week - b.week);

        const weeklyAvgMax = Math.max(
            ...weeklyAvgSeries.map(p => p.avg),
            0
        );

        // Top utenti per numero di pizze (periodo selezionato)
        const topUsersByCount: UserCountStat[] = Object.entries(userPizzaTotal)
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Top utenti per giorno della settimana selezionato (max 3)
        const topUsersByWeekday: UserCountStat[] = Object.entries(userWeekdayCounts)
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        // Top utenti per media ingredienti distinti per pizza
        const pizzaMap: Record<
            number,
            { userId: string; ingredients: Set<number> }
        > = {};

        rows.forEach(r => {
            if (!r.pizza_id || !r.user_id) return;
            const pid = r.pizza_id;
            if (!pizzaMap[pid]) {
                pizzaMap[pid] = {
                    userId: r.user_id,
                    ingredients: new Set<number>(),
                };
            }
            pizzaMap[pid].ingredients.add(r.ingredient_id);
        });

        const userDistinctMap: Record<string, { totalDistinct: number; pizzaCount: number }> = {};

        Object.values(pizzaMap).forEach(p => {
            const uid = p.userId;
            if (!uid) return;
            if (!userDistinctMap[uid]) {
                userDistinctMap[uid] = { totalDistinct: 0, pizzaCount: 0 };
            }
            userDistinctMap[uid].totalDistinct += p.ingredients.size;
            userDistinctMap[uid].pizzaCount += 1;
        });

        const topUsersByDistinct: UserDistinctStat[] = Object.entries(userDistinctMap)
            .map(([userId, v]) => ({
                userId,
                avgDistinct: v.totalDistinct / v.pizzaCount,
                pizzaCount: v.pizzaCount,
            }))
            .filter(u => u.pizzaCount >= 3)
            .sort((a, b) => b.avgDistinct - a.avgDistinct)
            .slice(0, 10);

        // Top ingredienti per giorno della settimana selezionato
        const ingByWeekday: Record<
            number,
            { name: string; count: number }
        > = {};

        rows.forEach(r => {
            if (!r.eaten_at) return;
            const d = new Date(r.eaten_at);
            if (Number.isNaN(d.getTime())) return;
            if (d.getDay() !== ingredientsWeekday) return;

            const id = r.ingredient_id;
            if (!ingByWeekday[id]) {
                ingByWeekday[id] = {
                    name: r.ingredient_name,
                    count: 0,
                };
            }
            ingByWeekday[id].count += 1;
        });

        const topIngredientsByWeekday: IngredientStat[] = Object.entries(ingByWeekday)
            .map(([id, v]) => ({
                id: Number(id),
                name: v.name,
                count: v.count,
                avgRating: null,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            topByCount,
            topByRating,
            topCombinations,
            weekdaySeries,
            weekdayMax,
            pieSeries,
            weeklyAvgSeries,
            weeklyAvgMax,
            topUsersByCount,
            topUsersByWeekday,
            topUsersByDistinct,
            topIngredientsByWeekday,
        };
    }, [rows, pizzasPeriod, year, month, originFilter, usersWeekday, ingredientsWeekday]);

    const periodLabel = month === 'all'
        ? `tutto il ${year}`
        : `${String(month).padStart(2, '0')}/${year}`;

    const getUserLabel = (userId: string) => {
        const p = profilesMap[userId];
        if (!p) return userId;
        return p.display_name || p.username || userId;
    };

    const getUserUsername = (userId: string): string | null => {
        const p = profilesMap[userId];
        return p?.username ?? null;
    };

    return (
        <>
            <LoginPromptModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
            <main className="min-h-screen bg-slate-900 text-slate-100">
                <AppHeader isLoggedIn={!!user} onLoginClick={() => setShowLoginModal(true)} />
                <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
                {/* Controlli globali periodo / provenienza */}
                <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
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
                    <div className="flex items-center gap-2">
                        <span className="text-slate-300">Provenienza (per alcuni grafici):</span>
                        <select
                            value={originFilter}
                            onChange={e =>
                                setOriginFilter(e.target.value as PizzaOriginFilter)
                            }
                            className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700"
                        >
                            <option value="all">Tutte</option>
                            <option value="takeaway">Da asporto</option>
                            <option value="frozen">Surgelate</option>
                            <option value="restaurant">Ristorante</option>
                            <option value="bakery">Panificio</option>
                            <option value="bar">Bar</option>
                            <option value="other">Altro</option>
                            <option value="unspecified">Non specificato</option>
                        </select>
                    </div>
                </div>

                {errorMsg && (
                    <p className="mb-3 text-sm text-red-400">{errorMsg}</p>
                )}

                {loading ? (
                    <p className="text-sm text-slate-300">
                        Carico le statistiche globali...
                    </p>
                ) : rows.length === 0 && pizzasPeriod.length === 0 ? (
                    <p className="text-sm text-slate-400">
                        Nessun dato disponibile per questo periodo.
                    </p>
                ) : (
                    <>
                        {/* SEZIONE: STATISTICHE UTENTI */}
                        <section className="space-y-3">
                            <h1 className="text-sm font-semibold text-slate-100">
                                Statistiche sugli utenti
                            </h1>
                            <p className="text-[11px] text-slate-400">
                                Classifiche basate su tutte le pizze registrate nel periodo selezionato ({periodLabel}).
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Top 10 utenti per numero di pizze */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-semibold">
                                            Top 10 utenti per numero di pizze
                                        </h2>
                                        <button
                                            onClick={() => router.push('/stats/users/top-pizzas')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>
                                    </div>
                                    {topUsersByCount.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun utente ha ancora pizze per questo periodo.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topUsersByCount.map((u, idx) => {
                                                const username = getUserUsername(u.userId);
                                                const label = getUserLabel(u.userId);
                                                return (
                                                    <li
                                                        key={u.userId}
                                                        className="flex items-center justify-between gap-2"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-4 text-slate-500">
                                                                {idx + 1}.
                                                            </span>
                                                            {username ? (
                                                                <Link
                                                                    href={`/u/${username}`}
                                                                    className="text-slate-100 hover:underline"
                                                                >
                                                                    {label}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-slate-100">
                                                                    {label}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-slate-300">
                                                            {u.count} pizze
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>

                                {/* Top 10 utenti per media ingredienti diversi */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-semibold">
                                            Top 10 per ingredienti distinti per pizza
                                        </h2>
                                        <button
                                            onClick={() => router.push('/stats/users/top-distinct-ingredients')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Consideriamo solo utenti con almeno 3 pizze nel periodo.
                                    </p>
                                    {topUsersByDistinct.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun utente ha abbastanza pizze per questa statistica.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topUsersByDistinct.map((u, idx) => {
                                                const username = getUserUsername(u.userId);
                                                const label = getUserLabel(u.userId);
                                                return (
                                                    <li
                                                        key={u.userId}
                                                        className="flex items-center justify-between gap-2"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-4 text-slate-500">
                                                                {idx + 1}.
                                                            </span>
                                                            {username ? (
                                                                <Link
                                                                    href={`/u/${username}`}
                                                                    className="text-slate-100 hover:underline"
                                                                >
                                                                    {label}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-slate-100">
                                                                    {label}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-slate-300 block">
                                                                {u.avgDistinct.toFixed(2).replace('.', ',')}{' '}
                                                                ingr./pizza
                                                            </span>
                                                            <span className="text-[10px] text-slate-500">
                                                                su {u.pizzaCount} pizze
                                                            </span>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>

                                {/* Top 3 utenti per giorno della settimana */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2 md:col-span-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <h2 className="text-sm font-semibold">
                                            Top 3 utenti per giorno della settimana
                                        </h2>
                                        <div className="flex items-center gap-2 text-[11px]">
                                            <span className="text-slate-300">Giorno:</span>
                                            <select
                                                value={usersWeekday}
                                                onChange={e => setUsersWeekday(Number(e.target.value))}
                                                className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700"
                                            >
                                                {WEEKDAY_LABELS_FULL.map((label, idx) => (
                                                    <option key={idx} value={idx}>
                                                        {label}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => router.push('/stats/users/top-weekday')}
                                                className="px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                            >
                                                Vedi dettaglio
                                            </button>
                                        </div>
                                    </div>
                                    {topUsersByWeekday.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun utente ha pizze in questo giorno della settimana per il periodo selezionato.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topUsersByWeekday.map((u, idx) => {
                                                const username = getUserUsername(u.userId);
                                                const label = getUserLabel(u.userId);
                                                return (
                                                    <li
                                                        key={u.userId}
                                                        className="flex items-center justify-between gap-2"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-4 text-slate-500">
                                                                {idx + 1}.
                                                            </span>
                                                            {username ? (
                                                                <Link
                                                                    href={`/u/${username}`}
                                                                    className="text-slate-100 hover:underline"
                                                                >
                                                                    {label}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-slate-100">
                                                                    {label}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-slate-300">
                                                        {u.count} pizze{' '}
                                                        {WEEKDAY_LABELS_FULL[usersWeekday] === 'Domenica' ? 'la' : 'il'}{' '}
                                                        {WEEKDAY_LABELS_FULL[usersWeekday]}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* SEZIONE: STATISTICHE INGREDIENTI */}
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold text-slate-100">
                                Statistiche sugli ingredienti
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                Ingredienti più usati e meglio votati nel periodo selezionato ({periodLabel}).
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Top per numero di pizze */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">
                                            Top 10 ingredienti per numero di pizze
                                        </h3>
                                        <button
                                            onClick={() => router.push('/stats/ingredients/top-count')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>
                                    </div>
                                    {topByCount.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun ingrediente ancora in classifica.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topByCount.map((ing, idx) => (
                                                <li
                                                    key={ing.id}
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-slate-500">
                                                            {idx + 1}.
                                                        </span>
                                                        <Link
                                                            href={`/stats/ingredients/${ing.id}`}
                                                            className="flex items-center gap-2 text-slate-100 hover:underline"
                                                        >
                                                            <span className="text-lg">
                                                                {getIngredientEmoji(ing.name)}
                                                            </span>
                                                            <span>{ing.name}</span>
                                                        </Link>
                                                    </div>
                                                    <span className="text-slate-300">
                                                        {ing.count} pizze
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Top combinazioni di ingredienti */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">
                                            Top 10 combinazioni di ingredienti
                                        </h3>
                                        <button
                                            onClick={() => router.push('/stats/ingredients/top-combinations')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mb-2">
                                        Le combinazioni di ingredienti più frequenti nelle pizze (min. 2 ingredienti).
                                    </p>
                                    {topCombinations.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessuna combinazione trovata per questo periodo.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1.5 text-xs">
                                            {topCombinations.map((combo, idx) => (
                                                <li
                                                    key={idx}
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <span className="w-4 text-slate-500 flex-shrink-0">
                                                            {idx + 1}.
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
                                                                        <span className="truncate">{ing.name}</span>
                                                                    </Link>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <span className="text-slate-300 flex-shrink-0">
                                                        {combo.count} pizze
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Top per voto medio */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">
                                            Top 10 ingredienti per voto medio
                                        </h3>
                                        <button
                                            onClick={() => router.push('/stats/ingredients/top-rating')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mb-2">
                                        Consideriamo solo ingredienti presenti in almeno 5 pizze
                                        nel periodo selezionato.
                                    </p>
                                    {topByRating.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun ingrediente ha abbastanza dati per la classifica
                                            del voto medio.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topByRating.map((ing, idx) => (
                                                <li
                                                    key={ing.id}
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-slate-500">
                                                            {idx + 1}.
                                                        </span>
                                                        <Link
                                                            href={`/stats/ingredients/${ing.id}`}
                                                            className="flex items-center gap-2 text-slate-100 hover:underline"
                                                        >
                                                            <span className="text-lg">
                                                                {getIngredientEmoji(ing.name)}
                                                            </span>
                                                            <span>{ing.name}</span>
                                                        </Link>

                                                    </div>
                                                    <span className="text-slate-300">
                                                        ⭐ {ing.avgRating!.toFixed(2).replace('.', ',')}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {/* Top ingredienti per giorno della settimana */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 md:col-span-2">
                                    <div className="flex items-center justify-between mb-2 gap-2">
                                        <h3 className="text-sm font-semibold">
                                            Top 10 ingredienti per giorno della settimana
                                        </h3>
                                        <div className="flex items-center gap-2 text-[11px]">
                                            <span className="text-slate-300">Giorno:</span>
                                            <select
                                                value={ingredientsWeekday}
                                                onChange={e =>
                                                    setIngredientsWeekday(Number(e.target.value))
                                                }
                                                className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700"
                                            >
                                                {WEEKDAY_LABELS_FULL.map((label, idx) => (
                                                    <option key={idx} value={idx}>
                                                        {label}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() =>
                                                    router.push('/stats/ingredients/top-weekday')
                                                }
                                                className="px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                            >
                                                Vedi dettaglio
                                            </button>
                                        </div>
                                    </div>
                                    {topIngredientsByWeekday.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessun ingrediente per questo giorno della settimana nel periodo selezionato.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 text-xs">
                                            {topIngredientsByWeekday.map((ing, idx) => (
                                                <li
                                                    key={ing.id}
                                                    className="flex items-center justify-between gap-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-4 text-slate-500">
                                                            {idx + 1}.
                                                        </span>
                                                        <Link
                                                            href={`/stats/ingredients/${ing.id}`}
                                                            className="flex items-center gap-2 text-slate-100 hover:underline"
                                                        >
                                                            <span className="text-lg">
                                                                {getIngredientEmoji(ing.name)}
                                                            </span>
                                                            <span>{ing.name}</span>
                                                        </Link>
                                                    </div>
                                                    <span className="text-slate-300">
                                                        {ing.count} pizze il{' '}
                                                        {WEEKDAY_LABELS_FULL[ingredientsWeekday]}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* SEZIONE: STATISTICHE GENERALI */}
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold text-slate-100">
                                Statistiche generali
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                Distribuzioni generali per giorno della settimana, provenienza e settimane.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Giorno della settimana */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">
                                            Pizze per giorno della settimana
                                        </h3>
                                        {/*<button
                                            onClick={() => router.push('/stats/general/weekday')}
                                            className="text-[11px] px-2 py-1 rounded-full border border-slate-600 hover:bg-slate-900"
                                        >
                                            Vedi dettaglio
                                        </button>*/}
                                    </div>
                                    <p className="text-[11px] text-slate-400 mb-2">
                                        Pizze per giorno della settimana nel periodo selezionato,
                                        filtrate per provenienza (in alto).
                                    </p>
                                    {weekdayMax === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessuna pizza registrata per questo periodo.
                                        </p>
                                    ) : (
                                        <div className="flex items-end gap-2 h-32">
                                            {weekdaySeries.map((count, idx) => {
                                                let heightPercent = 0;
                                                if (weekdayMax > 0 && count > 0) {
                                                    const ratio = count / weekdayMax; // 0–1
                                                    heightPercent = 20 + ratio * 80;
                                                }
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex-1 flex flex-col items-center justify-end h-full relative group"
                                                    >
                                                        {/* Tooltip */}
                                                        <div className="absolute bottom-full mb-2 px-2 py-1 rounded bg-slate-950 text-[10px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                                                            {WEEKDAY_LABELS_FULL[idx]}: {count} {count === 1 ? 'pizza' : 'pizze'}
                                                        </div>
                                                        <div
                                                            className="w-full rounded-t-md bg-amber-400 cursor-pointer"
                                                            style={{ height: `${heightPercent}%` }}
                                                        ></div>
                                                        <span className="text-[9px] mt-1 text-slate-400">
                                                            {WEEKDAY_LABELS_SHORT[idx]}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500">
                                                            {count}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Grafico a torta per provenienza */}
                                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">
                                            Distribuzione per provenienza
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={showUnspecified}
                                                onChange={e => setShowUnspecified(e.target.checked)}
                                                className="w-3 h-3 rounded border-slate-600 bg-slate-950"
                                            />
                                            <span>Mostra "Non specificato"</span>
                                        </label>
                                    </div>
                                    {pieSeries.length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                            Nessuna pizza con provenienza registrata per questo periodo.
                                        </p>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            {/* "Torta" */}
                                            <div
                                                className="w-24 h-24 rounded-full border border-slate-700 relative overflow-hidden"
                                                style={{
                                                    backgroundImage: (() => {
                                                        const total = pieSeries.reduce(
                                                            (s, p) => s + p.value,
                                                            0
                                                        );
                                                        if (total === 0) return 'none';
                                                        const colors = [
                                                            '#f97316', // arancio
                                                            '#22c55e', // verde
                                                            '#3b82f6', // blu
                                                            '#e11d48', // rosa
                                                            '#a855f7', // viola
                                                            '#facc15', // giallo
                                                        ];
                                                        let current = 0;
                                                        const segments: string[] = [];
                                                        pieSeries.forEach((p, idx) => {
                                                            const start = (current / total) * 360;
                                                            const sweep = (p.value / total) * 360;
                                                            const end = start + sweep;
                                                            const color = colors[idx % colors.length];
                                                            segments.push(
                                                                `${color} ${start}deg ${end}deg`
                                                            );
                                                            current += p.value;
                                                        });
                                                        return `conic-gradient(${segments.join(', ')})`;
                                                    })(),
                                                }}
                                            />
                                            {/* Legenda */}
                                            <div className="flex-1 space-y-1 text-[11px]">
                                                {pieSeries.map((item, idx) => {
                                                    const total = pieSeries.reduce(
                                                        (s, p) => s + p.value,
                                                        0
                                                    );
                                                    const pct =
                                                        total > 0
                                                            ? ((item.value / total) * 100).toFixed(1)
                                                            : '0.0';
                                                    const colors = [
                                                        '#f97316',
                                                        '#22c55e',
                                                        '#3b82f6',
                                                        '#e11d48',
                                                        '#a855f7',
                                                        '#facc15',
                                                    ];
                                                    const color = colors[idx % colors.length];
                                                    return (
                                                        <div
                                                            key={item.label}
                                                            className="flex items-center justify-between gap-2 group relative cursor-pointer hover:bg-slate-900/50 px-2 py-1 rounded transition-colors"
                                                        >
                                                            {/* Tooltip */}
                                                            <div className="absolute left-full ml-2 px-2 py-1 rounded bg-slate-950 text-[10px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                                                                {item.label}: {item.value} {item.value === 1 ? 'pizza' : 'pizze'} ({pct.replace('.', ',')}%)
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="w-3 h-3 rounded-full"
                                                                    style={{ backgroundColor: color }}
                                                                ></span>
                                                                <span className="text-slate-100">
                                                                    {item.label}
                                                                </span>
                                                            </div>
                                                            <span className="text-slate-300">
                                                                {item.value} ({pct.replace('.', ',')}%)
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Media pizze per utente per settimana */}
                            <div className="mt-2 bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold">
                                        Media pizze per utente per settimana
                                    </h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-2">
                                    Ogni barra mostra quante pizze in media mangia un utente nella settimana N del periodo selezionato.
                                </p>
                                {weeklyAvgSeries.length === 0 ? (
                                    <p className="text-xs text-slate-400">
                                        Nessun dato per questo periodo.
                                    </p>
                                ) : (
                                    <div className="flex items-end gap-1 h-32">
                                        {weeklyAvgSeries.map(point => {
                                            const height =
                                                weeklyAvgMax > 0
                                                    ? Math.max(8, (point.avg / weeklyAvgMax) * 100)
                                                    : 0;
                                            return (
                                                <div
                                                    key={point.week}
                                                    className="flex-1 flex flex-col items-center justify-end h-full relative group"
                                                >
                                                    {/* Tooltip */}
                                                    <div className="absolute bottom-full mb-2 px-2 py-1 rounded bg-slate-950 text-[10px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border border-slate-600">
                                                        Settimana {point.week}: {point.avg.toFixed(2).replace('.', ',')} pizze/utente
                                                    </div>
                                                    <div
                                                        className="w-full rounded-t-md bg-slate-300 cursor-pointer"
                                                        style={{ height: `${height}%` }}
                                                    ></div>
                                                    <span className="text-[9px] mt-1 text-slate-400">
                                                        {point.week}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500">
                                                        {point.avg.toFixed(2).replace('.', ',')}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        <p className="mt-2 text-[11px] text-slate-500">
                            Le statistiche sono calcolate su tutte le pizze registrate dagli
                            utenti nel database per il periodo selezionato.
                        </p>
                    </>
                )}
            </div>
        </main>
        </>
    );
}
