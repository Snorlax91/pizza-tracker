'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

type IngredientStat = {
    id: number;
    name: string;
    count: number;
    avgRating: number | null;
};

type PizzaOriginFilter =
    | 'all'
    | 'takeaway'
    | 'frozen'
    | 'restaurant'
    | 'bakery'
    | 'bar'
    | 'other';

type PizzaPeriodRow = {
    eaten_at: string | null;
    user_id: string;
    origin: string | null;
};


const CURRENT_YEAR = new Date().getFullYear();

export default function GlobalStatsPage() {
    const [year, setYear] = useState(CURRENT_YEAR);
    const [month, setMonth] = useState<number | 'all'>('all'); // 1-12 o 'all'
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [rows, setRows] = useState<
        {
            ingredient_id: number;
            ingredient_name: string;
            rating: number | null;
        }[]
    >([]);

    const [pizzasPeriod, setPizzasPeriod] = useState<PizzaPeriodRow[]>([]);
    const [originFilter, setOriginFilter] = useState<PizzaOriginFilter>('all');

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

                // 1) Statistiche ingredienti (come prima)
                const { data, error } = await supabase
                    .from('pizza_ingredients')
                    .select(
                        `
            ingredient_id,
            ingredients ( id, name ),
            pizzas!inner (
                eaten_at,
                rating
            )
            `
                    )
                    .gte('pizzas.eaten_at', startDate)
                    .lte('pizzas.eaten_at', endDate);

                if (error) throw error;

                const mapped =
                    data?.map((row: any) => ({
                        ingredient_id: row.ingredient_id as number,
                        ingredient_name: row.ingredients?.name as string,
                        rating:
                            typeof row.pizzas?.rating === 'number'
                                ? (row.pizzas.rating as number)
                                : null,
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


    const {
        topByCount,
        topByRating,
        weekdaySeries,
        weekdayMax,
        pieSeries,
        weeklyAvgSeries,
        weeklyAvgMax,
    } = useMemo(() => {
        // Ingredienti
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

        // Se non ci sono pizze nel periodo
        if (!pizzasPeriod || pizzasPeriod.length === 0) {
            return {
                topByCount,
                topByRating,
                weekdaySeries: Array(7).fill(0) as number[],
                weekdayMax: 0,
                pieSeries: [] as { label: string; value: number }[],
                weeklyAvgSeries: [] as { week: number; avg: number }[],
                weeklyAvgMax: 0,
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
        };

        const pieCounts: Record<PizzaOriginFilter, number> = {
            all: 0,
            takeaway: 0,
            frozen: 0,
            restaurant: 0,
            bakery: 0,
            bar: 0,
            other: 0,
        };

        // Per media pizze / utente / settimana
        const weeksMap: Record<
            number,
            { count: number; users: Set<string> }
        > = {};

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

            countsByOrigin.all[weekday] += 1;
            countsByOrigin[origin][weekday] += 1;
            pieCounts[origin] += 1;

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
            weeksMap[weekIndex].users.add(row.user_id);
        });

        const weekdaySeries = countsByOrigin[originFilter];
        const weekdayMax = Math.max(...weekdaySeries, 0);

        const pieSeries = (['takeaway', 'frozen', 'restaurant', 'bakery', 'bar', 'other'] as PizzaOriginFilter[])
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

        return {
            topByCount,
            topByRating,
            weekdaySeries,
            weekdayMax,
            pieSeries,
            weeklyAvgSeries,
            weeklyAvgMax,
        };
    }, [rows, pizzasPeriod, year, month, originFilter]);


    return (
        <main className="min-h-screen bg-slate-900 text-slate-100">
            <AppHeader />
            <div className="max-w-5xl mx-auto px-4 py-6">

                <div className="flex items-center gap-3 mb-4 text-xs">
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
                        <span className="text-slate-300">Provenienza:</span>
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
                ) : rows.length === 0 ? (
                    <p className="text-sm text-slate-400">
                        Nessun dato disponibile per questo periodo.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top per numero di pizze */}
                        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                            <h2 className="text-sm font-semibold mb-2">
                                Top 10 ingredienti per numero di pizze
                            </h2>
                            <p className="text-[11px] text-slate-400 mb-2">
                                Periodo: {month === 'all' ? 'tutto l’anno' : `mese ${month}`}{' '}
                                {year}.
                            </p>
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
                                                <span className="text-slate-100">
                                                    {ing.name}
                                                </span>
                                            </div>
                                            <span className="text-slate-300">
                                                {ing.count} pizze
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Top per voto medio */}
                        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                            <h2 className="text-sm font-semibold mb-2">
                                Top 10 ingredienti per voto medio
                            </h2>
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
                                                <span className="text-slate-100">
                                                    {ing.name}
                                                </span>
                                            </div>
                                            <span className="text-slate-300">
                                                ⭐ {ing.avgRating!.toFixed(2).replace('.', ',')}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Giorno della settimana */}
                            <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                                <h2 className="text-sm font-semibold mb-2">
                                    Giorno della settimana più usato
                                </h2>
                                <p className="text-[11px] text-slate-400 mb-2">
                                    Pizze per giorno della settimana nel periodo selezionato, filtrate per provenienza.
                                </p>
                                {weekdayMax === 0 ? (
                                    <p className="text-xs text-slate-400">
                                        Nessuna pizza registrata per questo periodo.
                                    </p>
                                ) : (
                                    <div className="flex items-end gap-2 h-32">
                                        {weekdaySeries.map((count, idx) => {
                                            const height =
                                                weekdayMax > 0
                                                    ? Math.max(8, (count / weekdayMax) * 100)
                                                    : 0;
                                            const labels = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex-1 flex flex-col items-center justify-end"
                                                >
                                                    <div
                                                        className="w-full rounded-t-md bg-amber-400"
                                                        style={{ height: `${height}%` }}
                                                    ></div>
                                                    <span className="text-[9px] mt-1 text-slate-400">
                                                        {labels[idx]}
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
                                <h2 className="text-sm font-semibold mb-2">
                                    Distribuzione per provenienza
                                </h2>
                                {pieSeries.length === 0 ? (
                                    <p className="text-xs text-slate-400">
                                        Nessuna pizza con provenienza registrata per questo periodo.
                                    </p>
                                ) : (
                                    <div className="flex items-center gap-4">
                                        {/* "Torta" */}
                                        <div className="w-24 h-24 rounded-full border border-slate-700 relative overflow-hidden"
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
                                                        key={item.label} // ✅ USIAMO LA LABEL COME KEY
                                                        className="flex items-center justify-between gap-2"
                                                    >
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
                        <div className="mt-4 bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                            <h2 className="text-sm font-semibold mb-2">
                                Media pizze per utente per settimana
                            </h2>
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
                                                className="flex-1 flex flex-col items-center justify-end"
                                            >
                                                <div
                                                    className="w-full rounded-t-md bg-slate-300"
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

                    </div>
                )}

                <p className="mt-4 text-[11px] text-slate-500">
                    Le statistiche sono calcolate su tutte le pizze registrate dagli
                    utenti nel database per il periodo selezionato.
                </p>
            </div>
        </main>
    );
}
