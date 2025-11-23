'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';

type PizzaRow = {
    user_id: string;
    eaten_at: string | null;
};

type ProfileLite = {
    id: string;
    username: string | null;
    display_name: string | null;
};

type LeaderboardRow = {
    userId: string;
    avgDistinct: number;
    pizzaCount: number;
};

type ViewMode = 'aroundMe' | 'top' | 'all' | 'search';

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 50;

export default function TopPizzasUsersPage() {
    const router = useRouter();

    const [userId, setUserId] = useState<string | null>(null);
    const [year, setYear] = useState(CURRENT_YEAR);
    const [month, setMonth] = useState<number | 'all'>('all');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [pizzas, setPizzas] = useState<PizzaRow[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
    const [profilesMap, setProfilesMap] = useState<Record<string, ProfileLite>>(
        {}
    );

    const [viewMode, setViewMode] = useState<ViewMode>('aroundMe');
    const [currentPage, setCurrentPage] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchResultIndex, setSearchResultIndex] = useState<number | null>(
        null
    );
    const [searchError, setSearchError] = useState<string | null>(null);

    // 1) Carica utente loggato
    useEffect(() => {
        const loadUser = async () => {
            const {
                data: { user },
                error,
            } = await supabase.auth.getUser();

            if (error || !user) {
                setUserId(null);
                router.push('/auth');
                return;
            }

            setUserId(user.id);
        };

        loadUser();
    }, [router]);

    // 2) Carica pizze per periodo (e costruisce leaderboard)
    useEffect(() => {
        const loadPizzas = async () => {
            if (!userId) return;

            setLoading(true);
            setErrorMsg(null);
            setLeaderboard([]);
            setPizzas([]);
            setProfilesMap({});
            setCurrentPage(0);
            setViewMode('aroundMe');
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
                    .select(`
            pizza_id,
            ingredient_id,
            pizzas!inner (
            id,
            user_id,
            eaten_at
            )
        `)
                    .gte('pizzas.eaten_at', startDate)
                    .lte('pizzas.eaten_at', endDate);

                if (error) throw error;

                const rows: PizzaRow[] =
                    (data ?? []).map((row: any) => ({
                        user_id: row.user_id as string,
                        eaten_at: (row.eaten_at as string) ?? null,
                    })) ?? [];

                setPizzas(rows);

                // 1. mappa pizza -> (userId, set ingredienti)
                const pizzaMap: Record<number, { userId: string; ingredients: Set<number> }> = {};

                (data ?? []).forEach((row: any) => {
                    const pid = row.pizza_id as number;
                    const uid = row.pizzas?.user_id as string;
                    const ingId = row.ingredient_id as number;

                    if (!pid || !uid || !ingId) return;

                    if (!pizzaMap[pid]) {
                        pizzaMap[pid] = { userId: uid, ingredients: new Set<number>() };
                    }
                    pizzaMap[pid].ingredients.add(ingId);
                });

                // 2. mappa user -> totale ingredienti distinti e numero di pizze
                const userDistinct: Record<string, { totalDistinct: number; pizzaCount: number }> = {};

                Object.values(pizzaMap).forEach(p => {
                    const uid = p.userId;
                    if (!userDistinct[uid]) {
                        userDistinct[uid] = { totalDistinct: 0, pizzaCount: 0 };
                    }
                    userDistinct[uid].totalDistinct += p.ingredients.size;
                    userDistinct[uid].pizzaCount += 1;
                });

                // 3. leaderboard: utenti con almeno 3 pizze, ordinati per media desc
                const lb: LeaderboardRow[] = Object.entries(userDistinct)
                    .map(([userId, v]) => ({
                        userId,
                        avgDistinct: v.totalDistinct / v.pizzaCount,
                        pizzaCount: v.pizzaCount,
                    }))
                    .filter(u => u.pizzaCount >= 3)
                    .sort((a, b) => b.avgDistinct - a.avgDistinct);

                setLeaderboard(lb);
            } catch (err: any) {
                console.error(err);
                setErrorMsg(
                    err.message ??
                    'Errore nel caricamento della classifica globale degli utenti.'
                );
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            loadPizzas();
        }
    }, [userId, year, month]);

    // 3) Carica profili di tutti gli userId presenti in leaderboard
    useEffect(() => {
        const loadProfiles = async () => {
            if (leaderboard.length === 0) {
                setProfilesMap({});
                return;
            }

            const ids = leaderboard.map(r => r.userId);
            const uniqueIds = Array.from(new Set(ids));

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, username, display_name')
                    .in('id', uniqueIds);

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
                console.error(
                    'Errore nel caricare i profili per la classifica globale',
                    err
                );
            }
        };

        loadProfiles();
    }, [leaderboard]);

    const periodLabel =
        month === 'all'
            ? `tutto il ${year}`
            : `${String(month).padStart(2, '0')}/${year}`;

    const myIndex = useMemo(() => {
        if (!userId || leaderboard.length === 0) return -1;
        return leaderboard.findIndex(row => row.userId === userId);
    }, [leaderboard, userId]);

    const pageCount = useMemo(() => {
        if (leaderboard.length === 0) return 0;
        return Math.ceil(leaderboard.length / PAGE_SIZE);
    }, [leaderboard.length]);

    const getUserLabel = (uid: string) => {
        const p = profilesMap[uid];
        if (!p) return uid;
        return p.display_name || p.username || uid;
    };

    const getUserUsername = (uid: string): string | null => {
        const p = profilesMap[uid];
        return p?.username ?? null;
    };

    // SEARCH nella classifica
    const handleSearch = () => {
        setSearchError(null);

        const q = searchTerm.trim().toLowerCase();
        if (!q) {
            // reset -> torno a "Intorno a me"
            setSearchResultIndex(null);
            setViewMode('aroundMe');
            return;
        }

        const idx = leaderboard.findIndex(row => {
            const p = profilesMap[row.userId];
            const username = p?.username?.toLowerCase() ?? '';
            const dn = p?.display_name?.toLowerCase() ?? '';
            const idStr = row.userId.toLowerCase();
            return (
                username.includes(q) ||
                dn.includes(q) ||
                idStr.includes(q)
            );
        });

        if (idx === -1) {
            setSearchResultIndex(null);
            setViewMode('all');
            setSearchError(
                'Nessun utente trovato in classifica con questo nome.'
            );
            return;
        }

        setSearchResultIndex(idx);
        setViewMode('search');
    };

    // calcolo della porzione da mostrare
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

        const windowSize = 5;
        const index =
            viewMode === 'aroundMe'
                ? myIndex
                : viewMode === 'search'
                    ? searchResultIndex ?? -1
                    : -1;

        if (index === -1) {
            // se non sono in classifica o non c'è risultato, fallback alla top 50
            return leaderboard.slice(0, PAGE_SIZE);
        }

        const start = Math.max(0, index - windowSize);
        const end = Math.min(leaderboard.length, index + windowSize + 1);
        return leaderboard.slice(start, end);
    }, [leaderboard, viewMode, currentPage, myIndex, searchResultIndex]);

    // info sul range globale che stiamo vedendo
    const displayedRangeInfo = useMemo(() => {
        if (
            leaderboard.length === 0 ||
            displayedLeaderboard.length === 0
        )
            return null;

        const firstIdx = leaderboard.findIndex(
            r => r.userId === displayedLeaderboard[0].userId
        );
        const lastIdx = leaderboard.findIndex(
            r =>
                r.userId ===
                displayedLeaderboard[displayedLeaderboard.length - 1].userId
        );
        if (firstIdx === -1 || lastIdx === -1) return null;

        return {
            startPos: firstIdx + 1,
            endPos: lastIdx + 1,
            total: leaderboard.length,
        };
    }, [leaderboard, displayedLeaderboard]);

    if (!userId) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
                <p>Caricamento...</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
            <AppHeader />

            <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-sm font-semibold">
                        Classifica utenti – ingredienti distinti per pizza
                    </h1>
                    <p className="text-[11px] text-slate-400">
                        Utenti ordinati per media di ingredienti distinti per pizza nel periodo selezionato ({periodLabel}). Solo utenti con almeno tre pizze vengono inclusi.
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
                        Nessuna pizza registrata per questo periodo.
                    </p>
                ) : (
                    <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
                        {/* Barra controlli vista + ricerca */}
                        <div className="flex flex-wrap items-center gap-2 justify-between text-[11px]">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('aroundMe');
                                        setSearchResultIndex(null);
                                        setSearchError(null);
                                    }}
                                    className={`px-3 py-1 rounded-full border ${viewMode === 'aroundMe'
                                        ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                                        : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                                        }`}
                                >
                                    Intorno a me
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('top');
                                        setSearchResultIndex(null);
                                        setSearchError(null);
                                    }}
                                    className={`px-3 py-1 rounded-full border ${viewMode === 'top'
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
                                    }}
                                    className={`px-3 py-1 rounded-full border ${viewMode === 'all'
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
                                    placeholder="Cerca utente in classifica..."
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
                                su {displayedRangeInfo.total} utenti.
                            </p>
                        )}

                        {/* Lista classifica */}
                        <ul className="space-y-2 text-xs">
                            {displayedLeaderboard.map(row => {
                                const profile = profilesMap[row.userId];
                                const username = profile?.username ?? null;
                                const label = getUserLabel(row.userId);
                                const globalIndex =
                                    leaderboard.findIndex(r => r.userId === row.userId) + 1;
                                const isMe = row.userId === userId;

                                return (
                                    <li
                                        key={row.userId}
                                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl ${isMe
                                            ? 'bg-amber-400/10 border border-amber-300/60'
                                            : 'bg-slate-900/60 border border-slate-700'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs w-8 text-slate-400">
                                                #{globalIndex}
                                            </span>
                                            <span className="text-sm">
                                                {username ? (
                                                    <Link
                                                        href={`/u/${username}`}
                                                        className="hover:underline"
                                                    >
                                                        {label}
                                                    </Link>
                                                ) : (
                                                    label
                                                )}
                                                {isMe && (
                                                    <span className="ml-1 text-[10px] text-amber-300">
                                                        (tu)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-semibold block">
                                                {row.avgDistinct.toFixed(2).replace('.', ',')} ingr./pizza
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                                su {row.pizzaCount} pizze
                                            </span>
                                        </div>

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
                            La classifica considera solo le pizze effettivamente
                            registrate nel periodo, non i contatori iniziali impostati
                            manualmente.
                        </p>
                    </div>
                )}
            </div>
        </main>
    );
}
