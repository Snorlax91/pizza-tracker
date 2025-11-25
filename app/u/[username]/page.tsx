'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import Link from 'next/link';

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type PizzaRow = {
  id: number;
  name: string | null;
  eaten_at: string | null;
  rating: number | null;
  origin: string | null;
  photo_url: string | null;
  notes: string | null;
  pizza_ingredients: {
    ingredients: {
      id: number;
      name: string;
    } | null;
  }[];
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

const ORIGIN_LABELS = {
  takeaway: 'Da asporto',
  frozen: 'Surgelata',
  restaurant: 'Ristorante',
  bakery: 'Panificio',
  bar: 'Bar',
  other: 'Altro',
} as const;

type PizzaOrigin = keyof typeof ORIGIN_LABELS;

const CURRENT_YEAR = new Date().getFullYear();
const PAGE_SIZE = 10;

// Emoji per ingredienti
const INGREDIENT_EMOJI_MAP: Record<string, string> = {
  // classici
  cipolla: '🧅',
  cipolle: '🧅',
  salame: '🍖',
  'salame piccante': '🌶️',
  'salamino piccante': '🌶️',
  salsiccia: '🥩',
  wurstel: '🌭',
  'wurstel di pollo': '🌭',
  prosciutto: '🥓',
  'prosciutto cotto': '🥓',
  'prosciutto crudo': '🥓',
  speck: '🥓',

  // verdure
  funghi: '🍄',
  carciofi: '🫒',
  carciofo: '🫒',
  zucchine: '🥒',
  zucchina: '🥒',
  melanzane: '🍆',
  melanzana: '🍆',
  peperoni: '🫑',
  peperone: '🫑',
  rucola: '🥬',
  insalata: '🥬',
  basilico: '🌿',

  // mare
  tonno: '🐟',
  acciughe: '🐟',
  acciuga: '🐟',
  gamberi: '🦐',

  // extra
  olive: '🫒',
  'olive nere': '🫒',
  'olive verdi': '🫒',
  mais: '🌽',
  ananas: '🍍',
  gorgonzola: '🧀',
  'mozzarella di bufala': '🧀',
  bufala: '🧀',

  // patate
  'patatine fritte': '🍟',
  'patate fritte': '🍟',
  patate: '🥔',
  'patate al forno': '🥔',
  'patate arrosto': '🥔',
};

function getIngredientEmoji(name?: string | null): string {
  if (!name) return '🍕';
  let n = name.toLowerCase().trim();
  n = n
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // rimuove accenti
  return INGREDIENT_EMOJI_MAP[n] ?? '🍕';
}

type Friendship = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: string;
};

export default function UserPizzasPage() {
  const router = useRouter();
  const params = useParams();
  const usernameParam = params?.username as string | undefined;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pizzas, setPizzas] = useState<PizzaRow[]>([]);
  const [pizzasPage, setPizzasPage] = useState(0);
  const [pizzasHasMore, setPizzasHasMore] = useState(true);
  const [pizzasLoading, setPizzasLoading] = useState(false);

  const [yearRank, setYearRank] = useState<GlobalRank | null>(null);
  const [monthRank, setMonthRank] = useState<GlobalRank | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Friendship state
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [loadingFriendship, setLoadingFriendship] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const statsYear = CURRENT_YEAR;

  // carico l'utente loggato (mi serve solo per sapere se sto guardando me stesso)
  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };

    loadCurrentUser();
  }, []);

  // carico il profilo del "padrone" della pagina (/u/[username])
  useEffect(() => {
    const loadProfile = async () => {
      if (!usernameParam) {
        setProfileError('Utente non specificato.');
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .eq('username', usernameParam)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setProfileError('Utente non trovato.');
          setProfileLoading(false);
          return;
        }

        setProfile(data as Profile);
      } catch (err: any) {
        console.error(err);
        setProfileError(
          err.message ?? 'Errore nel caricamento del profilo.'
        );
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [usernameParam]);

  // carico lo stato dell'amicizia quando ho profilo e currentUser
  useEffect(() => {
    const loadFriendship = async () => {
      if (!currentUserId || !profile || currentUserId === profile.id) {
        // Non serve caricare se non c'è utente loggato o se sto guardando me stesso
        setFriendship(null);
        return;
      }

      setLoadingFriendship(true);
      try {
        const { data, error } = await supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${currentUserId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${currentUserId})`
          )
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        setFriendship(data as Friendship | null);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingFriendship(false);
      }
    };

    loadFriendship();
  }, [currentUserId, profile]);

  // carico highlight (rank + top ingrediente) per questo profilo
  useEffect(() => {
    const loadHighlights = async () => {
      if (!profile) return;

      setLoadingHighlights(true);
      try {
        const uid = profile.id;
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;

        const startYear = `${y}-01-01`;
        const endYear = `${y}-12-31`;

        const startMonth = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endMonth = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

        // CLASSIFICA GLOBALE ANNUALE
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

        // CLASSIFICA GLOBALE MENSILE
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

        // HIGHLIGHT INGREDIENTE PREFERITO NELL'ANNO
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
              ingFreq[id] = {
                name: ing.name as string,
                count: 0,
              };
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

        // Highlight: top annuale pizze
        if (
          yearRankObj.rank &&
          yearRankObj.rank <= 10 &&
          yearRankObj.totalUsers > 0
        ) {
          newHighlights.push({
            id: 'year-pizzas',
            label: `Top ${yearRankObj.rank} per pizze ${y}`,
            description: `Ha registrato ${yearRankObj.count} pizze nel ${y}.`,
            rank: yearRankObj.rank,
          });
        }

        // Highlight: top mensile pizze
        if (
          monthRankObj.rank &&
          monthRankObj.rank <= 10 &&
          monthRankObj.totalUsers > 0
        ) {
          const monthLabel = MONTH_LABELS[m - 1] ?? `${m}`;
          newHighlights.push({
            id: 'month-pizzas',
            label: `Top ${monthRankObj.rank} a ${monthLabel}`,
            description: `Questo mese ha registrato ${monthRankObj.count} pizze.`,
            rank: monthRankObj.rank,
          });
        }

        // Highlight: primo ingrediente preferito
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
              description: `Ha mangiato ${count} pizze con ${fav.name} nel ${y}.`,
              rank,
            });
          }
        }

        setHighlights(newHighlights);
      } catch (err) {
        console.error(err);
        // non blocchiamo la pagina per errori stats
      } finally {
        setLoadingHighlights(false);
      }
    };

    loadHighlights();
  }, [profile]);

  // carico pizze paginated per questo utente (con ingredienti)
  const loadPizzasPage = async (page: number) => {
    if (!profile) return;
    setPizzasLoading(true);
    setErrorMsg(null);

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('pizzas')
        .select(
          `
          id,
          name,
          eaten_at,
          rating,
          origin,
          photo_url,
          notes,
          pizza_ingredients (
            ingredients (
              id,
              name
            )
          )
        `
        )
        .eq('user_id', profile.id)
        .order('eaten_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows: PizzaRow[] =
        (data ?? []).map((row: any) => ({
          id: row.id as number,
          name: row.name ?? null,
          eaten_at: row.eaten_at ?? null,
          rating:
            typeof row.rating === 'number' ? (row.rating as number) : null,
          origin: row.origin ?? null,
          photo_url: row.photo_url ?? null,
          notes: row.notes ?? null,
          pizza_ingredients:
            (row.pizza_ingredients as any[])?.map((pi: any) => ({
              ingredients: pi.ingredients
                ? {
                    id: pi.ingredients.id as number,
                    name: pi.ingredients.name as string,
                  }
                : null,
            })) ?? [],
        })) ?? [];

      if (page === 0) {
        setPizzas(rows);
      } else {
        setPizzas(prev => [...prev, ...rows]);
      }

      setPizzasHasMore(rows.length === PAGE_SIZE);
      setPizzasPage(page);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message ?? 'Errore nel caricamento delle pizze di questo utente.'
      );
    } finally {
      setPizzasLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      // reset paginazione quando cambiamo utente
      setPizzas([]);
      setPizzasPage(0);
      setPizzasHasMore(true);
      loadPizzasPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const isMe = currentUserId && profile && currentUserId === profile.id;

  const displayName =
    profile?.display_name || profile?.username || 'Utente';

  // Funzione per inviare richiesta d'amicizia
  const handleAddFriend = async () => {
    if (!currentUserId || !profile || isMe) return;
    
    setFriendActionLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.from('friendships').insert({
        requester_id: currentUserId,
        addressee_id: profile.id,
        status: 'pending',
      });

      if (error) throw error;

      // Aggiorna stato locale
      setFriendship({
        id: -1,
        requester_id: currentUserId,
        addressee_id: profile.id,
        status: 'pending',
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell\'invio della richiesta d\'amicizia.');
    } finally {
      setFriendActionLoading(false);
    }
  };

  // Determina lo stato dell'amicizia per mostrare il bottone corretto
  const getFriendshipStatus = () => {
    if (!currentUserId || isMe) return null;
    if (!friendship) return 'none';
    if (friendship.status === 'accepted') return 'friends';
    if (friendship.status === 'pending' && friendship.requester_id === currentUserId) {
      return 'pending-sent';
    }
    if (friendship.status === 'pending' && friendship.addressee_id === currentUserId) {
      return 'pending-received';
    }
    return 'none';
  };

  const friendshipStatus = getFriendshipStatus();

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-300">Caricamento profilo...</p>
        </div>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-red-400">
            {profileError ?? 'Profilo non trovato.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader />

      {/* Barra highlight "alla home", ma per questo utente */}
      <section className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-5xl mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-sm font-semibold">
                Pizze di {displayName}
              </h1>
              {profile.username && (
                <p className="text-[11px] text-slate-400">
                  @{profile.username}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMe && (
                <Link
                  href="/"
                  className="text-[11px] px-3 py-1 rounded-full border border-slate-700 hover:bg-slate-800"
                >
                  Vai alla tua home
                </Link>
              )}
              {!isMe && currentUserId && friendshipStatus && (
                <div>
                  {friendshipStatus === 'none' && (
                    <button
                      onClick={handleAddFriend}
                      disabled={friendActionLoading || loadingFriendship}
                      className="text-xs px-3 py-1.5 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {friendActionLoading ? (
                        'Invio...'
                      ) : (
                        <>
                          <span>👤</span>
                          <span>Aggiungi amico</span>
                        </>
                      )}
                    </button>
                  )}
                  {friendshipStatus === 'pending-sent' && (
                    <div className="text-xs px-3 py-1.5 rounded-full border border-slate-600 text-slate-400 flex items-center gap-1">
                      <span>⏳</span>
                      <span>Richiesta inviata</span>
                    </div>
                  )}
                  {friendshipStatus === 'pending-received' && (
                    <div className="text-xs px-3 py-1.5 rounded-full border border-amber-400 text-amber-300 flex items-center gap-1">
                      <span>📥</span>
                      <span>Richiesta ricevuta</span>
                    </div>
                  )}
                  {friendshipStatus === 'friends' && (
                    <div className="text-xs px-3 py-1.5 rounded-full bg-green-900/40 border border-green-600 text-green-300 flex items-center gap-1">
                      <span>✓</span>
                      <span>Amici</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {loadingHighlights ? (
            <p className="text-[11px] text-slate-400">
              Carico le sue statistiche globali...
            </p>
          ) : (
            <>
              {/* Posizione mese/anno */}
              <div className="flex flex-wrap gap-2 text-xs">
                {/* ANNO */}
                <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      yearRank?.rank === 1
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
                        <>Posizione globale {statsYear}</>
                      ) : (
                        <>Ancora nessuna pizza registrata quest&apos;anno</>
                      )}
                    </span>
                    {yearRank?.rank && yearRank.totalUsers > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {yearRank.count} pizze • su{' '}
                        {yearRank.totalUsers} utenti
                      </span>
                    )}
                  </div>
                </div>

                {/* MESE */}
                <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      monthRank?.rank === 1
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
                        {monthRank.count} pizze • su{' '}
                        {monthRank.totalUsers} utenti
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
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          h.rank === 1
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
            </>
          )}
        </div>
      </section>

      {/* Lista pizze paginata */}
      <section className="flex-1 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm font-semibold mb-3">
            Pizze registrate
          </h2>

          {errorMsg && (
            <p className="text-xs text-red-400 mb-2">{errorMsg}</p>
          )}

          {pizzas.length === 0 && !pizzasLoading ? (
            <p className="text-xs text-slate-400">
              Nessuna pizza visibile per questo utente.
            </p>
          ) : (
            <div className="space-y-3">
              {pizzas.map(p => {
                // ingredienti filtrati validi
                const ingredients =
                  p.pizza_ingredients
                    ?.map(pi => pi.ingredients)
                    .filter((ing): ing is { id: number; name: string } => !!ing) ??
                  [];

                return (
                  <div
                    key={p.id}
                    className="bg-slate-800/70 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2"
                  >
                    {/* intestazione: data + nome + rating */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-200">
                          {p.eaten_at
                            ? new Date(p.eaten_at).toLocaleDateString()
                            : 'Data sconosciuta'}
                        </span>
                        <span className="text-[11px] text-slate-300 font-semibold">
                          {p.name && p.name.trim() !== ''
                            ? p.name
                            : 'Pizza'}
                        </span>
                      </div>
                      {p.rating !== null && (
                        <span className="text-amber-300">
                          ⭐ {p.rating.toFixed(1).replace('.', ',')}
                        </span>
                      )}
                    </div>

                    {/* provenienza */}
                    {p.origin && (
                      <span className="text-[11px] text-slate-400">
                        Provenienza:{' '}
                        {
                          ORIGIN_LABELS[
                            (p.origin ?? 'other') as PizzaOrigin
                          ]
                        }
                      </span>
                    )}

                    {/* note */}
                    {p.notes && (
                      <p className="text-[11px] text-slate-300">
                        {p.notes}
                      </p>
                    )}

                    {/* ingredienti */}
                    {ingredients.length > 0 && (
                      <div className="mt-1">
                        <p className="text-[11px] text-slate-400 mb-1">
                          Ingredienti:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {ingredients.map(ing => (
                            <Link
                              key={ing.id}
                              href={`/stats/ingredients/${ing.id}`}
                              className="px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-[11px] flex items-center gap-1 hover:border-amber-400 hover:text-amber-200"
                            >
                              <span className="text-sm">
                                {getIngredientEmoji(ing.name)}
                              </span>
                              <span>{ing.name}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* foto */}
                    {p.photo_url && (
                      <div className="mt-2 w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900">
                        <img
                          src={p.photo_url}
                          alt="Foto pizza"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-center">
            {pizzasHasMore && (
              <button
                type="button"
                onClick={() => loadPizzasPage(pizzasPage + 1)}
                disabled={pizzasLoading}
                className="text-xs px-4 py-2 rounded-full border border-slate-700 hover:bg-slate-800 disabled:opacity-50"
              >
                {pizzasLoading ? 'Carico...' : 'Carica altre pizze'}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
