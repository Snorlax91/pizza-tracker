'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';

type Ingredient = {
    id: number;
    name: string;
};

type PizzaForIngredient = {
    id: number;
    user_id: string;
    eaten_at: string | null;
    rating: number | null;
    origin: string | null;
};

type ProfileLite = {
    id: string;
    username: string | null;
    display_name: string | null;
};

type CoOccurringIngredient = {
    ingredientId: number;
    name: string;
    count: number;
};

type TopUser = {
    userId: string;
    count: number;
};

type OriginStat = {
    origin: string;
    count: number;
};

const originLabel = (o: string | null) => {
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
        default:
            return 'Altro / n.d.';
    }
};

const INGREDIENT_EMOJI_MAP: Record<string, string> = {
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

    'tonno': '🐟',
    'acciughe': '🐟',
    'acciuga': '🐟',
    'gamberi': '🦐',

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
    let n = name.toLowerCase().trim();
    n = n
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
    return INGREDIENT_EMOJI_MAP[n] ?? '🍕';
}


export default function IngredientProfilePage() {
    const params = useParams();
    const router = useRouter();
    const ingredientIdParam = params?.ingredientId as string | undefined;

    const [userId, setUserId] = useState<string | null>(null);
    const [ingredient, setIngredient] = useState<Ingredient | null>(null);
    const [pizzas, setPizzas] = useState<PizzaForIngredient[]>([]);
    const [coOccurring, setCoOccurring] = useState<CoOccurringIngredient[]>([]);
    const [topUsers, setTopUsers] = useState<TopUser[]>([]);
    const [profilesMap, setProfilesMap] = useState<Record<string, ProfileLite>>(
        {}
    );
    const [originStats, setOriginStats] = useState<OriginStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // auth (per ora richiediamo login anche per vedere il profilo ingrediente)
    useEffect(() => {
        const loadUser = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setUserId(null);
                router.push('/auth');
                return;
            }

            setUserId(user.id);
        };

        loadUser();
    }, [router]);

    useEffect(() => {
        const loadData = async () => {
            if (!userId) return;
            if (!ingredientIdParam) {
                setErrorMsg('ID ingrediente non valido.');
                setLoading(false);
                return;
            }

            const ingredientIdNum = Number(ingredientIdParam);
            if (Number.isNaN(ingredientIdNum)) {
                setErrorMsg('ID ingrediente non valido.');
                setLoading(false);
                return;
            }

            setLoading(true);
            setErrorMsg(null);

            try {
                // 1) Ingredient base
                const { data: ingData, error: ingError } = await supabase
                    .from('ingredients')
                    .select('id, name')
                    .eq('id', ingredientIdNum)
                    .maybeSingle();

                if (ingError) throw ingError;
                if (!ingData) {
                    setErrorMsg('Ingrediente non trovato.');
                    setLoading(false);
                    return;
                }

                setIngredient({
                    id: ingData.id as number,
                    name: ingData.name as string,
                });

                // 2) Pizze che contengono questo ingrediente
                const { data: piData, error: piError } = await supabase
                    .from('pizza_ingredients')
                    .select(
                        `
            pizza_id,
            pizzas!inner (
              id,
              user_id,
              eaten_at,
              rating,
              origin
            )
          `
                    )
                    .eq('ingredient_id', ingredientIdNum);

                if (piError) throw piError;

                const pizzaMap = new Map<number, PizzaForIngredient>();

                (piData ?? []).forEach((row: any) => {
                    const p = row.pizzas;
                    if (!p) return;
                    const pid = p.id as number;
                    if (!pid) return;
                    if (!pizzaMap.has(pid)) {
                        pizzaMap.set(pid, {
                            id: pid,
                            user_id: p.user_id as string,
                            eaten_at: (p.eaten_at as string) ?? null,
                            rating: (p.rating as number | null) ?? null,
                            origin: (p.origin as string | null) ?? null,
                        });
                    }
                });

                const pizzaList = Array.from(pizzaMap.values());
                setPizzas(pizzaList);

                // 3) Co-occorrenti: tutti gli altri ingredienti presenti sulle stesse pizze
                const pizzaIds = pizzaList.map(p => p.id);
                if (pizzaIds.length > 0) {
                    const { data: coData, error: coError } = await supabase
                        .from('pizza_ingredients')
                        .select(
                            `
              ingredient_id,
              ingredients ( id, name ),
              pizza_id
            `
                        )
                        .in('pizza_id', pizzaIds);

                    if (coError) throw coError;

                    const coCounts: Record<number, { name: string; count: number }> = {};

                    (coData ?? []).forEach((row: any) => {
                        const ingId = row.ingredient_id as number;
                        const ingName = row.ingredients?.name as string | undefined;
                        const pid = row.pizza_id as number;

                        if (!ingId || !ingName || !pid) return;
                        if (ingId === ingredientIdNum) return; // escludo se stesso

                        if (!coCounts[ingId]) {
                            coCounts[ingId] = { name: ingName, count: 0 };
                        }
                        coCounts[ingId].count += 1;
                    });

                    const coList: CoOccurringIngredient[] = Object.entries(coCounts)
                        .map(([id, v]) => ({
                            ingredientId: Number(id),
                            name: v.name,
                            count: v.count,
                        }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10);

                    setCoOccurring(coList);
                }

                // 4) Top utenti utilizzatori
                const userCounts: Record<string, number> = {};
                pizzaList.forEach(p => {
                    if (!p.user_id) return;
                    userCounts[p.user_id] = (userCounts[p.user_id] || 0) + 1;
                });

                const topUsersList: TopUser[] = Object.entries(userCounts)
                    .map(([uid, count]) => ({ userId: uid, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);

                setTopUsers(topUsersList);

                // 5) Carica profili per gli utenti top
                if (topUsersList.length > 0) {
                    const ids = topUsersList.map(t => t.userId);
                    const { data: profiles, error: pError } = await supabase
                        .from('profiles')
                        .select('id, username, display_name')
                        .in('id', ids);

                    if (pError) throw pError;

                    const pMap: Record<string, ProfileLite> = {};
                    (profiles ?? []).forEach((p: any) => {
                        pMap[p.id] = {
                            id: p.id as string,
                            username: p.username as string | null,
                            display_name: p.display_name as string | null,
                        };
                    });
                    setProfilesMap(pMap);
                }

                // 6) Distribuzione per provenienza
                const originCounts: Record<string, number> = {};
                pizzaList.forEach(p => {
                    const key = p.origin ?? 'other';
                    originCounts[key] = (originCounts[key] || 0) + 1;
                });
                const originStatsList: OriginStat[] = Object.entries(originCounts)
                    .map(([origin, count]) => ({ origin, count }))
                    .sort((a, b) => b.count - a.count);

                setOriginStats(originStatsList);
            } catch (err: any) {
                console.error(err);
                setErrorMsg(
                    err.message ??
                    'Errore nel caricamento delle statistiche per questo ingrediente.'
                );
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [userId, ingredientIdParam]);

    const totalPizzas = pizzas.length;
    const avgRating = useMemo(() => {
        if (pizzas.length === 0) return null;
        let sum = 0;
        let count = 0;
        pizzas.forEach(p => {
            if (typeof p.rating === 'number') {
                sum += p.rating;
                count += 1;
            }
        });
        if (count === 0) return null;
        return sum / count;
    }, [pizzas]);

    const getUserLabel = (uid: string) => {
        const p = profilesMap[uid];
        if (!p) return uid;
        return p.display_name || p.username || uid;
    };

    const getUserUsername = (uid: string): string | null => {
        const p = profilesMap[uid];
        return p?.username ?? null;
    };

    if (!userId) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
                <p>Caricamento...</p>
            </main>
        );
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
                <AppHeader />
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-slate-300">
                        Carico le statistiche dell&apos;ingrediente...
                    </p>
                </div>
            </main>
        );
    }

    if (!ingredient) {
        return (
            <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
                <AppHeader />
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-red-400">
                        {errorMsg ?? 'Ingrediente non trovato.'}
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
            <AppHeader />

            <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-sm font-semibold">
                        Profilo ingrediente – {ingredient.name}
                    </h1>
                    <p className="text-[11px] text-slate-400">
                        Statistiche sull&apos;utilizzo globale di questo ingrediente
                        in tutte le pizze registrate.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Card: Sintesi */}
                    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                        <h2 className="text-xs font-semibold text-slate-100">
                            Panoramica
                        </h2>
                        <p className="text-sm text-slate-100 flex items-center gap-2">
                            <span className="text-xl">{getIngredientEmoji(ingredient.name)}</span>
                            <span>{ingredient.name}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Usato in{' '}
                            <span className="font-semibold">
                                {totalPizzas} pizza{totalPizzas === 1 ? '' : 'e'}
                            </span>{' '}
                            totali.
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Voto medio delle pizze:{' '}
                            {avgRating !== null ? (
                                <span className="font-semibold">
                                    {avgRating.toFixed(2).replace('.', ',')} / 10
                                </span>
                            ) : (
                                <span className="text-slate-500">n.d.</span>
                            )}
                        </p>
                    </div>

                    {/* Card: Provenienza */}
                    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                        <h2 className="text-xs font-semibold text-slate-100">
                            Provenienza pizze
                        </h2>
                        {originStats.length === 0 ? (
                            <p className="text-[11px] text-slate-400">
                                Nessuna informazione sulla provenienza.
                            </p>
                        ) : (
                            <ul className="space-y-1 text-[11px]">
                                {originStats.map(o => {
                                    const total = totalPizzas || 1;
                                    const pct = ((o.count / total) * 100).toFixed(1);
                                    return (
                                        <li
                                            key={o.origin}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <span className="text-slate-100">
                                                {originLabel(o.origin)}
                                            </span>
                                            <span className="text-slate-300">
                                                {o.count} ({pct.replace('.', ',')}%)
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Card: Top utenti */}
                    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                        <h2 className="text-xs font-semibold text-slate-100">
                            Top 10 utenti utilizzatori
                        </h2>
                        {topUsers.length === 0 ? (
                            <p className="text-[11px] text-slate-400">
                                Nessun utente ha ancora usato questo ingrediente.
                            </p>
                        ) : (
                            <ul className="space-y-1 text-[11px]">
                                {topUsers.map((u, idx) => {
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
                                                {u.count} pizza{u.count === 1 ? '' : 'e'}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Card: Co-occorrenti */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                    <h2 className="text-xs font-semibold text-slate-100">
                        Usato insieme a...
                    </h2>
                    <p className="text-[11px] text-slate-400 mb-1">
                        Ingredienti che compaiono più spesso nelle stesse pizze di{' '}
                        <span className="font-semibold">{ingredient.name}</span>.
                    </p>
                    {coOccurring.length === 0 ? (
                        <p className="text-[11px] text-slate-400">
                            Nessun altro ingrediente co-occorre con questo nelle pizze
                            registrate.
                        </p>
                    ) : (
                        <ul className="space-y-1 text-xs">
                            {coOccurring.map((ing, idx) => (
                                <li
                                    key={ing.ingredientId}
                                    className="flex items-center justify-between gap-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="w-4 text-slate-500">
                                            {idx + 1}.
                                        </span>
                                        <span className="text-lg">
                                            {getIngredientEmoji(ing.name)}
                                        </span>
                                        <Link
                                            href={`/ingredients/${ing.ingredientId}`}
                                            className="text-slate-100 hover:underline"
                                        >
                                            {ing.name}
                                        </Link>
                                    </div>
                                    <span className="text-slate-300">
                                        {ing.count} pizza{ing.count === 1 ? '' : 'e'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <p className="mt-1 text-[11px] text-slate-500">
                    Le statistiche sono calcolate su tutte le pizze registrate da
                    tutti gli utenti che includono questo ingrediente.
                </p>
            </div>
        </main>
    );
}
