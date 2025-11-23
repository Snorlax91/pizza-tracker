'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

type Visibility = 'everyone' | 'friends' | 'groups' | 'none';

type PizzaRow = {
    id: number;
    eaten_at: string | null;
    rating: number | null;
    pizza_ingredients: {
        ingredients: { id: number; name: string };
    }[];
};

type GlobalRank = {
    rank: number | null;
    totalUsers: number;
};

type IngredientRank = {
    ingredientName: string | null;
    ingredientId: number | null;
    rank: number | null;
    totalUsers: number;
    count: number;
};

type WeekdayRank = {
    weekdayIndex: number;
    weekdayName: string;
    rank: number;
    totalUsers: number;
    count: number;
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

const CURRENT_YEAR = new Date().getFullYear();

export default function ProfilePage() {
    const router = useRouter();
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [userId, setUserId] = useState<string | null>(null);

    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [pizzaVisibility, setPizzaVisibility] =
        useState<Visibility>('everyone');
    const [emailVisibility, setEmailVisibility] =
        useState<Visibility>('friends');

    const [statsYear, setStatsYear] = useState<number>(CURRENT_YEAR);
    const [loadingStats, setLoadingStats] = useState(false);
    const [pizzas, setPizzas] = useState<PizzaRow[]>([]);
    const [globalRank, setGlobalRank] = useState<GlobalRank>({
        rank: null,
        totalUsers: 0,
    });
    const [ingredientRank, setIngredientRank] = useState<IngredientRank>({
        ingredientName: null,
        ingredientId: null,
        rank: null,
        totalUsers: 0,
        count: 0,
    });

    const [baseCount, setBaseCount] = useState<number>(0);
    const [savingBaseCount, setSavingBaseCount] = useState(false);

    // Stati per i nuovi ranking
    const [rankings, setRankings] = useState<RankingEntry[]>([]);

    // Carica profilo + user
    useEffect(() => {
        const load = async () => {
            setLoadingProfile(true);
            setErrorMsg(null);

            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError || !user) {
                    router.push('/auth');
                    return;
                }

                setUserId(user.id);

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select(
                        'id, username, display_name, pizza_visibility, email_visibility'
                    )
                    .eq('id', user.id)
                    .single();

                if (profileError) throw profileError;

                setUsername(profile.username || '');
                setDisplayName(profile.display_name || '');
                setPizzaVisibility(
                    (profile.pizza_visibility as Visibility) || 'everyone'
                );
                setEmailVisibility(
                    (profile.email_visibility as Visibility) || 'friends'
                );
            } catch (err: any) {
                console.error(err);
                setErrorMsg(
                    err.message ?? 'Errore nel caricamento del profilo.'
                );
            } finally {
                setLoadingProfile(false);
            }
        };

        load();
    }, [router]);

    const handleSaveBaseCount = async () => {
        if (!userId) return;
        setSavingBaseCount(true);
        setErrorMsg(null);

        try {
            const { error } = await supabase
                .from('user_yearly_counters')
                .upsert(
                    {
                        user_id: userId,
                        year: statsYear,
                        base_count: baseCount,
                    },
                    { onConflict: 'user_id,year' }
                );

            if (error) throw error;
        } catch (err: any) {
            console.error(err);
            setErrorMsg(
                err.message ??
                'Errore nel salvataggio del contatore di partenza.'
            );
        } finally {
            setSavingBaseCount(false);
        }
    };


    const validateUsername = (value: string) => {
        if (value.length < 3 || value.length > 20) {
            return 'Il nickname deve essere tra 3 e 20 caratteri.';
        }
        if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
            return 'Il nickname può contenere solo lettere, numeri, . e _.';
        }
        return null;
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        const trimmedUsername = username.trim();
        const trimmedDisplayName = displayName.trim();

        const usernameError = validateUsername(trimmedUsername);
        if (usernameError) {
            setErrorMsg(usernameError);
            return;
        }

        setSaving(true);

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                router.push('/auth');
                return;
            }

            const { data: existing, error: existingError } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', trimmedUsername)
                .neq('id', user.id)
                .maybeSingle();

            if (existingError && existingError.code !== 'PGRST116') {
                throw existingError;
            }

            if (existing) {
                setErrorMsg('Questo nickname è già in uso, scegline un altro.');
                setSaving(false);
                return;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    username: trimmedUsername,
                    display_name: trimmedDisplayName || trimmedUsername,
                    pizza_visibility: pizzaVisibility,
                    email_visibility: emailVisibility,
                })
                .eq('id', user.id);

            if (updateError) throw updateError;

            router.refresh();
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message ?? 'Errore nel salvataggio del profilo.');
        } finally {
            setSaving(false);
        }
    };

    // Carica statistiche pizze per l'anno scelto
    useEffect(() => {
        const loadStats = async () => {
            if (!userId) return;
            setLoadingStats(true);
            setErrorMsg(null);

            try {
                const { data, error } = await supabase
                    .from('pizzas')
                    .select(
                        `
          id,
          eaten_at,
          rating,
          pizza_ingredients (
            ingredients (
              id,
              name
            )
          )
        `
                    )
                    .eq('user_id', userId)
                    .gte('eaten_at', `${statsYear}-01-01`)
                    .lte('eaten_at', `${statsYear}-12-31`)
                    .order('eaten_at', { ascending: true });

                if (error) throw error;

                // Mappiamo esplicitamente in PizzaRow[]
                const mapped: PizzaRow[] =
                    (data ?? []).map((row: any) => ({
                        id: row.id as number,
                        eaten_at: (row.eaten_at as string) ?? null,
                        rating:
                            typeof row.rating === 'number' ? (row.rating as number) : null,
                        pizza_ingredients:
                            (row.pizza_ingredients ?? []).map((pi: any) => ({
                                ingredients: {
                                    id: pi.ingredients?.id as number,
                                    name: pi.ingredients?.name as string,
                                },
                            })) ?? [],
                    }));

                setPizzas(mapped);

                // RANK GLOBALE PIZZE PER ANNO (solo da tabella pizzas, senza base_count)
                try {
                    const { data: allPizzas, error: allError } = await supabase
                        .from('pizzas')
                        .select('user_id')
                        .gte('eaten_at', `${statsYear}-01-01`)
                        .lte('eaten_at', `${statsYear}-12-31`);

                    if (allError) throw allError;

                    const counts: Record<string, number> = {};
                    (allPizzas ?? []).forEach(row => {
                        counts[row.user_id] = (counts[row.user_id] || 0) + 1;
                    });

                    const entries = Object.entries(counts).sort(
                        (a, b) => b[1] - a[1]
                    );
                    const totalUsers = entries.length;
                    const myIndex = entries.findIndex(([uid]) => uid === userId);
                    setGlobalRank({
                        rank: myIndex === -1 ? null : myIndex + 1,
                        totalUsers,
                    });
                } catch (e) {
                    console.warn('Impossibile calcolare rank globale pizze', e);
                }

                // RANK GLOBALE PER INGREDIENTE PREFERITO
                try {
                    const freq: Record<number, { name: string; count: number }> =
                        {};
                    (data ?? []).forEach((p: any) => {
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

                    const sorted = Object.entries(freq)
                        .map(([id, val]) => ({
                            id: Number(id),
                            name: val.name,
                            count: val.count,
                        }))
                        .sort((a, b) => b.count - a.count);

                    if (sorted.length === 0) {
                        setIngredientRank({
                            ingredientName: null,
                            ingredientId: null,
                            rank: null,
                            totalUsers: 0,
                            count: 0,
                        });
                    } else {
                        const fav = sorted[0];

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
                            .gte('pizzas.eaten_at', `${statsYear}-01-01`)
                            .lte('pizzas.eaten_at', `${statsYear}-12-31`);

                        if (allPiError) throw allPiError;

                        const byUser: Record<string, number> = {};
                        (allPi ?? []).forEach((row: any) => {
                            const uid = row.pizzas.user_id as string;
                            byUser[uid] = (byUser[uid] || 0) + 1;
                        });

                        const entries = Object.entries(byUser).sort(
                            (a, b) => b[1] - a[1]
                        );
                        const totalUsers = entries.length;
                        const myIndex = entries.findIndex(
                            ([uid]) => uid === userId
                        );
                        const myCount = byUser[userId] || 0;

                        setIngredientRank({
                            ingredientName: fav.name,
                            ingredientId: fav.id,
                            rank: myIndex === -1 ? null : myIndex + 1,
                            totalUsers,
                            count: myCount,
                        });
                    }
                } catch (e) {
                    console.warn('Impossibile calcolare rank ingredienti', e);
                }

                // CONTATORE DI PARTENZA (user_yearly_counters)
                try {
                    const { data: yearly, error: yearlyError } = await supabase
                        .from('user_yearly_counters')
                        .select('base_count')
                        .eq('user_id', userId)
                        .eq('year', statsYear)
                        .maybeSingle();

                    if (yearlyError && yearlyError.code !== 'PGRST116') {
                        throw yearlyError;
                    }

                    setBaseCount(
                        yearly && typeof yearly.base_count === 'number'
                            ? yearly.base_count
                            : 0
                    );
                } catch (e) {
                    console.warn(
                        'Impossibile caricare il contatore di partenza',
                        e
                    );
                    // non blocchiamo la pagina se fallisce questo
                    setBaseCount(0);
                }

                // ========== NUOVA LOGICA PER RANKING COMPLESSI ==========
                const newRankings: RankingEntry[] = [];

                // 1. RANK GLOBALE PER IL 2025 (sempre mostrato)
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
                        const myIndex = entries.findIndex(([uid]) => uid === userId);
                        const myCount = counts[userId] || 0;

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

                // 2. RANK GLOBALE PER IL MESE CORRENTE (sempre mostrato)
                try {
                    const now = new Date();
                    const currentYear = now.getFullYear();
                    const currentMonth = now.getMonth() + 1; // 1-12
                    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
                    
                    // Calcola l'ultimo giorno del mese corrente
                    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
                    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

                    const { data: pizzasMonth, error: errorMonth } = await supabase
                        .from('pizzas')
                        .select('user_id')
                        .gte('eaten_at', startDate)
                        .lte('eaten_at', endDate);

                    if (!errorMonth && pizzasMonth) {
                        const counts: Record<string, number> = {};
                        pizzasMonth.forEach(row => {
                            counts[row.user_id] = (counts[row.user_id] || 0) + 1;
                        });

                        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                        const totalUsers = entries.length;
                        const myIndex = entries.findIndex(([uid]) => uid === userId);
                        const myCount = counts[userId] || 0;

                        if (myIndex !== -1) {
                            const monthNames = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                                              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
                            newRankings.push({
                                type: 'currentMonth',
                                label: `Pizze mangiate a ${monthNames[currentMonth - 1]} ${currentYear}`,
                                rank: myIndex + 1,
                                totalUsers,
                                count: myCount,
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Impossibile calcolare rank mese corrente', e);
                }

                // 3. TOP 10 PER GIORNI DELLA SETTIMANA
                try {
                    const weekdayNames = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
                    
                    // Carica tutte le pizze per l'anno selezionato per calcolare i ranking per weekday
                    const { data: allPizzasYear, error: errorYear } = await supabase
                        .from('pizzas')
                        .select('user_id, eaten_at')
                        .gte('eaten_at', `${statsYear}-01-01`)
                        .lte('eaten_at', `${statsYear}-12-31`);

                    if (!errorYear && allPizzasYear) {
                        // Conta le pizze per utente per ogni giorno della settimana
                        const weekdayCounts: Record<number, Record<string, number>> = {};
                        for (let i = 0; i < 7; i++) {
                            weekdayCounts[i] = {};
                        }

                        allPizzasYear.forEach(row => {
                            if (!row.eaten_at) return;
                            const d = new Date(row.eaten_at);
                            if (Number.isNaN(d.getTime())) return;
                            const weekday = d.getDay(); // 0-6
                            weekdayCounts[weekday][row.user_id] = (weekdayCounts[weekday][row.user_id] || 0) + 1;
                        });

                        // Per ogni giorno della settimana, verifica se l'utente è in top 10
                        for (let weekday = 0; weekday < 7; weekday++) {
                            const counts = weekdayCounts[weekday];
                            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                            const myIndex = entries.findIndex(([uid]) => uid === userId);
                            const myCount = counts[userId] || 0;

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

                // 4. TOP 10 PER INGREDIENTI
                try {
                    // Ottieni tutti gli ingredienti usati dall'utente nell'anno selezionato
                    const freq: Record<number, { name: string; count: number }> = {};
                    (data ?? []).forEach((p: any) => {
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

                    // Per ogni ingrediente usato, calcola il ranking globale
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
                            .gte('pizzas.eaten_at', `${statsYear}-01-01`)
                            .lte('pizzas.eaten_at', `${statsYear}-12-31`);

                        if (allPiError || !allPi) continue;

                        const byUser: Record<string, number> = {};
                        allPi.forEach((row: any) => {
                            const uid = row.pizzas.user_id as string;
                            byUser[uid] = (byUser[uid] || 0) + 1;
                        });

                        const entries = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
                        const totalUsers = entries.length;
                        const myIndex = entries.findIndex(([uid]) => uid === userId);

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

                    // Ordina per rank (migliori primi)
                    ingredientRankings.sort((a, b) => a.rank - b.rank);

                    // Aggiungi tutti quelli in top 10
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

                    // 5. Se non ci sono ingredienti in top 10, aggiungi il migliore
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


            } catch (err: any) {
                console.error(err);
                setErrorMsg(
                    err.message ?? 'Errore nel caricamento delle statistiche.'
                );
            } finally {
                setLoadingStats(false);
            }
        };

        loadStats();
    }, [userId, statsYear]);

    // Derivati per grafici
    const {
        totalYear,
        totalMonth,
        totalWeek,
        byMonth,
        byWeekday,
        ingredientStats,
    } = useMemo(() => {
        if (!pizzas || pizzas.length === 0) {
            return {
                totalYear: 0,
                totalMonth: 0,
                totalWeek: 0,
                byMonth: Array(12).fill(0) as number[],
                byWeekday: Array(7).fill(0) as number[],
                ingredientStats: [] as { name: string; count: number; pct: number }[],
            };
        }

        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentWeekStart = new Date(now);
        currentWeekStart.setHours(0, 0, 0, 0);
        currentWeekStart.setDate(now.getDate() - now.getDay()); // domenica come start

        const byMonthArr = Array(12).fill(0) as number[];
        const byWeekdayArr = Array(7).fill(0) as number[];
        const ingredientFreq: Record<string, number> = {};

        let monthCount = 0;
        let weekCount = 0;

        pizzas.forEach(p => {
            if (!p.eaten_at) return;
            const d = new Date(p.eaten_at);
            if (Number.isNaN(d.getTime())) return;

            const m = d.getMonth();
            const w = d.getDay(); // 0 domenica - 6 sabato
            byMonthArr[m] += 1;
            byWeekdayArr[w] += 1;

            if (m === currentMonth) monthCount += 1;

            const dayOnly = new Date(d);
            dayOnly.setHours(0, 0, 0, 0);
            if (dayOnly >= currentWeekStart) weekCount += 1;

            (p.pizza_ingredients ?? []).forEach(pi => {
                const ing = pi.ingredients;
                if (!ing) return;
                ingredientFreq[ing.name] = (ingredientFreq[ing.name] || 0) + 1;
            });
        });

        const totalYear = pizzas.length;
        const ingredientEntries = Object.entries(ingredientFreq).sort(
            (a, b) => b[1] - a[1]
        );
        const topIngredients = ingredientEntries.slice(0, 6);
        const ingredientStats = topIngredients.map(([name, count]) => ({
            name,
            count,
            pct: totalYear > 0 ? (count / totalYear) * 100 : 0,
        }));

        return {
            totalYear,
            totalMonth: monthCount,
            totalWeek: weekCount,
            byMonth: byMonthArr,
            byWeekday: byWeekdayArr,
            ingredientStats,
        };
    }, [pizzas]);

    const maxMonth = Math.max(...byMonth);
    const maxWeekday = Math.max(...byWeekday);

    if (loadingProfile) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
                <p>Caricamento profilo...</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-900 text-slate-100">
            <AppHeader />
            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Link href="/">
                            <span className="text-sm text-slate-300 hover:text-white">
                                ⬅ Home
                            </span>
                        </Link>
                        <h1 className="text-xl font-bold">Profilo & statistiche</h1>
                    </div>
                    <Link
                        href="/stats"
                        className="text-xs px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                    >
                        Statistiche globali
                    </Link>
                </div>

                {errorMsg && (
                    <p className="mb-3 text-sm text-red-400">{errorMsg}</p>
                )}

                {/* Layout a 2 colonne su desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Colonna sinistra: impostazioni profilo */}
                    <form
                        onSubmit={handleSaveProfile}
                        className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4"
                    >
                        <h2 className="text-sm font-semibold mb-1">
                            Impostazioni profilo
                        </h2>

                        <div className="space-y-1">
                            <label className="text-xs text-slate-300">
                                Nickname (univoco)
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                                required
                            />
                            <p className="text-[11px] text-slate-400">
                                Usato per farti trovare dagli amici e per l&apos;URL del
                                profilo.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-slate-300">Nome visibile</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                            />
                            <p className="text-[11px] text-slate-400">
                                Comparirà nelle classifiche e nelle liste.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-slate-300">
                                Chi può vedere le tue pizze (lista dettagli)?
                            </label>
                            <select
                                value={pizzaVisibility}
                                onChange={e =>
                                    setPizzaVisibility(e.target.value as Visibility)
                                }
                                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                            >
                                <option value="everyone">Tutti</option>
                                <option value="friends">Solo amici</option>
                                <option value="groups">
                                    Solo chi è con me in un gruppo
                                </option>
                                <option value="none">Nessuno (solo io)</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-slate-300">
                                Chi può vedere la tua email
                            </label>
                            <select
                                value={emailVisibility}
                                onChange={e =>
                                    setEmailVisibility(e.target.value as Visibility)
                                }
                                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                            >
                                <option value="everyone">Tutti</option>
                                <option value="friends">Solo amici</option>
                                <option value="groups">
                                    Solo chi è con me in un gruppo
                                </option>
                                <option value="none">Nessuno</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="mt-2 w-full py-2.5 rounded-xl bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Salvo...' : 'Salva impostazioni'}
                        </button>
                    </form>

                    {/* Colonna destra: statistiche personali */}
                    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold">
                                Statistiche personali
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setStatsYear(y => y - 1)}
                                    className="px-2 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                                >
                                    ◀
                                </button>
                                <span className="text-xs text-slate-300">
                                    {statsYear}
                                </span>
                                <button
                                    onClick={() => setStatsYear(y => y + 1)}
                                    className="px-2 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                                >
                                    ▶
                                </button>
                            </div>
                        </div>

                        {loadingStats ? (
                            <p className="text-xs text-slate-300">
                                Carico le tue statistiche...
                            </p>
                        ) : (
                            <>
                                {/* Riepilogo veloce */}
                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">
                                        <p className="text-[11px] text-slate-400">Anno</p>
                                        <p className="text-xl font-bold">{totalYear}</p>
                                    </div>
                                    <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">
                                        <p className="text-[11px] text-slate-400">Questo mese</p>
                                        <p className="text-xl font-bold">{totalMonth}</p>
                                    </div>
                                    <div className="bg-slate-900/70 rounded-xl p-2 border border-slate-700">
                                        <p className="text-[11px] text-slate-400">
                                            Ultimi 7 giorni
                                        </p>
                                        <p className="text-xl font-bold">{totalWeek}</p>
                                    </div>
                                </div>

                                {/* Contatore di partenza per l'anno */}
                                <div className="mt-2 bg-slate-900/70 rounded-xl p-3 border border-slate-700 flex flex-col gap-2">
                                    <p className="text-[11px] text-slate-300 font-semibold">
                                        Pizze già mangiate prima di usare l&apos;app ({statsYear})
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            value={baseCount}
                                            onChange={e => {
                                                const v = e.target.value;
                                                const n = parseInt(v, 10);
                                                setBaseCount(Number.isNaN(n) ? 0 : Math.max(0, n));
                                            }}
                                            className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs focus:outline-none focus:ring focus:ring-slate-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveBaseCount}
                                            disabled={savingBaseCount}
                                            className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-900 text-xs font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {savingBaseCount ? 'Salvo...' : 'Salva'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500">
                                        Questo numero viene aggiunto al contatore veloce sulla
                                        home per il {statsYear}, ma non influisce sulle
                                        classifiche globali.
                                    </p>
                                </div>


                                {/* Grafico per mesi */}
                                <div>
                                    <p className="text-[11px] text-slate-400 mb-1">
                                        Distribuzione per mese
                                    </p>
                                    {totalYear === 0 ? (
                                        <p className="text-[11px] text-slate-500">
                                            Nessuna pizza registrata per questo anno.
                                        </p>
                                    ) : (
                                        <div className="flex items-end gap-1 h-28">
                                            {byMonth.map((count, idx) => {
                                                const height =
                                                    maxMonth > 0
                                                        ? Math.max(8, (count / maxMonth) * 100)
                                                        : 0;
                                                const labels = [
                                                    'G',
                                                    'F',
                                                    'M',
                                                    'A',
                                                    'M',
                                                    'G',
                                                    'L',
                                                    'A',
                                                    'S',
                                                    'O',
                                                    'N',
                                                    'D',
                                                ];
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex-1 flex flex-col items-center justify-end h-full"
                                                    >
                                                        <div
                                                            className="w-full rounded-t-md bg-amber-400"
                                                            style={{ height: `${height}%` }}
                                                        ></div>
                                                        <span className="text-[9px] mt-1 text-slate-400">
                                                            {labels[idx]}
                                                        </span>
                                                        {/* tooltip "custom" sopra la barra (hover/tap) */}
                                                        <div className="pointer-events-none absolute -top-6 px-2 py-1 rounded bg-slate-900 text-[10px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {count} pizze
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Grafico per giorno della settimana */}
                                <div>
                                    <p className="text-[11px] text-slate-400 mb-1">
                                        Giorno preferito per la pizza
                                    </p>
                                    {totalYear === 0 ? (
                                        <p className="text-[11px] text-slate-500">
                                            Nessun dato per questo anno.
                                        </p>
                                    ) : (
                                        <div className="flex items-end gap-1 h-24">
                                            {byWeekday.map((count, idx) => {
                                                const height =
                                                    maxWeekday > 0
                                                        ? Math.max(10, (count / maxWeekday) * 100)
                                                        : 0;
                                                const labels = [
                                                    'D',
                                                    'L',
                                                    'M',
                                                    'M',
                                                    'G',
                                                    'V',
                                                    'S',
                                                ];
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex-1 flex flex-col items-center justify-end h-full"
                                                    >
                                                        <div
                                                            className="w-full rounded-t-md bg-slate-300"
                                                            style={{ height: `${height}%` }}
                                                        ></div>
                                                        <span className="text-[9px] mt-1 text-slate-400">
                                                            {labels[idx]}
                                                        </span>
                                                        {/* tooltip "custom" sopra la barra (hover/tap) */}
                                                        <div className="pointer-events-none absolute -top-6 px-2 py-1 rounded bg-slate-900 text-[10px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {count} pizze
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Ingredienti top */}
                                <div>
                                    <p className="text-[11px] text-slate-400 mb-1">
                                        Ingredienti più usati (quest&apos;anno)
                                    </p>
                                    {ingredientStats.length === 0 ? (
                                        <p className="text-[11px] text-slate-500">
                                            Nessun ingrediente registrato (aggiungili dalle pizze
                                            per vedere le statistiche).
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            {ingredientStats.map(ing => (
                                                <div key={ing.name} className="text-[11px]">
                                                    <div className="flex justify-between mb-0.5">
                                                        <span className="text-slate-200">
                                                            {ing.name}
                                                        </span>
                                                        <span className="text-slate-400">
                                                            {ing.count} (
                                                            {ing.pct.toFixed(1).replace('.', ',')}%)
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                                                        <div
                                                            className="h-full bg-amber-400"
                                                            style={{ width: `${ing.pct}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Ranking globali */}
                                <div className="mt-1 space-y-1.5 text-[11px] text-slate-300">
                                    <p className="font-semibold">Posizionamenti globali</p>
                                    {rankings.length === 0 ? (
                                        <p className="text-slate-400">Nessun dato disponibile per il periodo selezionato.</p>
                                    ) : (
                                        <>
                                            {rankings.map((ranking, idx) => {
                                                // Determina se mostrare il nome dell'ingrediente come link
                                                const showIngredientLink = ranking.type === 'ingredient' || ranking.type === 'bestIngredient';
                                                
                                                return (
                                                    <p key={idx} className="leading-relaxed">
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
                                                        {' '}sei{' '}
                                                        <span className="font-bold text-amber-400">
                                                            #{ranking.rank}
                                                        </span>
                                                        {' '}su {ranking.totalUsers} utenti
                                                        {ranking.count !== undefined && (
                                                            <> ({ranking.count} {ranking.count === 1 ? 'pizza' : 'pizze'})</>
                                                        )}.
                                                    </p>
                                                );
                                            })}
                                        </>
                                    )}
                                    <p className="text-[10px] text-slate-500 pt-1">
                                        Le classifiche globali sono calcolate sulle pizze
                                        registrate nel database (non includono il contatore
                                        &quot;di partenza&quot;).
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
