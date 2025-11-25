'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Footer } from '@/components/Footer';


type User = {
  id: string;
  email?: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Friendship = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: string;
};

type LeaderboardRow = {
  userId: string;
  profile: Profile | null;
  baseCount: number;
  pizzaCount: number;
  total: number;
  isMe: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();



function FriendsPageContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [tab, setTab] = useState<'friends' | 'requests' | 'search'>('friends');

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  

  // Carica utente
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setUser(null);
        setLoadingUser(false);
        return;
      }

      setUser({ id: user.id, email: user.email ?? undefined });
      setLoadingUser(false);
    };

    loadUser();
  }, [router]);

  // Carica amicizie e profili
  useEffect(() => {
    const loadFriends = async () => {
      if (!user) return;
      setLoadingFriends(true);
      setErrorMsg(null);

      try {
        const { data: friends, error } = await supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(
            `requester_id.eq.${user.id},addressee_id.eq.${user.id}`
          );

        if (error) throw error;

        const f = friends ?? [];
        setFriendships(f);

        // raccogli tutti gli user id da cui ci serve il profilo
        const ids = new Set<string>();
        ids.add(user.id);
        f.forEach(fr => {
          ids.add(fr.requester_id);
          ids.add(fr.addressee_id);
        });

        if (ids.size > 0) {
          const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', Array.from(ids));

          if (pError) throw pError;

          const map: Record<string, Profile> = {};
          (profiles ?? []).forEach(p => {
            map[p.id] = p;
          });
          setProfilesMap(map);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message ?? 'Errore nel caricamento degli amici.');
      } finally {
        setLoadingFriends(false);
      }
    };

    loadFriends();
  }, [user]);

  // Leaderboard
  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!user) return;
      setLeaderboardLoading(true);
      setErrorMsg(null);

      try {
        // utenti coinvolti: me + amici accettati
        const accepted = friendships.filter(f => f.status === 'accepted');
        const friendIds = new Set<string>();
        accepted.forEach(f => {
          const otherId =
            f.requester_id === user.id ? f.addressee_id : f.requester_id;
          friendIds.add(otherId);
        });

        const participants = [user.id, ...Array.from(friendIds)];
        if (participants.length === 0) {
          setLeaderboard([]);
          return;
        }

        // base_count per anno
        const { data: yearly, error: yearlyError } = await supabase
          .from('user_yearly_counters')
          .select('user_id, base_count')
          .eq('year', year)
          .in('user_id', participants);

        if (yearlyError) throw yearlyError;

        const baseMap: Record<string, number> = {};
        (yearly ?? []).forEach(row => {
          baseMap[row.user_id] = row.base_count ?? 0;
        });

        // pizze per anno (prendiamo solo user_id e contiamo lato client)
        const { data: pizzas, error: pizzasError } = await supabase
          .from('pizzas')
          .select('user_id')
          .in('user_id', participants)
          .gte('eaten_at', `${year}-01-01`)
          .lte('eaten_at', `${year}-12-31`);

        if (pizzasError) throw pizzasError;

        const countMap: Record<string, number> = {};
        participants.forEach(id => {
          countMap[id] = 0;
        });

        (pizzas ?? []).forEach(row => {
          if (row.user_id in countMap) {
            countMap[row.user_id] += 1;
          }
        });

        // compone righe
        const rows: LeaderboardRow[] = participants.map(uid => ({
          userId: uid,
          profile: profilesMap[uid] ?? null,
          baseCount: baseMap[uid] ?? 0,
          pizzaCount: countMap[uid] ?? 0,
          total: (baseMap[uid] ?? 0) + (countMap[uid] ?? 0),
          isMe: uid === user.id,
        }));

        rows.sort((a, b) => b.total - a.total);

        setLeaderboard(rows);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nel caricamento della classifica.'
        );
      } finally {
        setLeaderboardLoading(false);
      }
    };

    if (user) {
      loadLeaderboard();
    }
  }, [user, friendships, year, profilesMap]);

  // Utils
  const getProfileLabel = (id: string) => {
    const p = profilesMap[id];
    if (!p) return id;
    return p.display_name || p.username || p.id;
  };

  // Richieste
  const incomingRequests = friendships.filter(
    f => f.status === 'pending' && f.addressee_id === user?.id
  );
  const outgoingRequests = friendships.filter(
    f => f.status === 'pending' && f.requester_id === user?.id
  );
  const acceptedFriends = friendships.filter(f => f.status === 'accepted');

  const handleAccept = async (friendshipId: number) => {
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);

      if (error) throw error;

      // ricarica amicizie
      const { data: friends, error: fError } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(
          `requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`
        );

      if (fError) throw fError;
      setFriendships(friends ?? []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’accettare la richiesta.');
    }
  };

  const handleSearch = async () => {
    if (!user) return;
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${term}%`)
        .neq('id', user.id)
        .limit(20);

      if (error) throw error;

      // rimuovi chi è già amico o ha già una richiesta in corso
      const existingIds = new Set<string>();
      friendships.forEach(f => {
        existingIds.add(f.requester_id);
        existingIds.add(f.addressee_id);
      });

      const filtered = (data ?? []).filter(p => !existingIds.has(p.id));

      setSearchResults(filtered);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nella ricerca degli utenti.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddFriend = async (otherId: string) => {
    if (!user) return;
    setErrorMsg(null);

    try {
      const { error } = await supabase.from('friendships').insert({
        requester_id: user.id,
        addressee_id: otherId,
        status: 'pending',
      });

      if (error) throw error;

      // aggiorna localmente
      setFriendships(prev => [
        ...prev,
        {
          id: -Math.floor(Math.random() * 1000000),
          requester_id: user.id,
          addressee_id: otherId,
          status: 'pending',
        },
      ]);
      
      // Aggiungi il profilo a profilesMap se presente nei searchResults
      const profile = searchResults.find(p => p.id === otherId);
      if (profile) {
        setProfilesMap(prev => ({
          ...prev,
          [otherId]: profile,
        }));
      }
      
      // rimuovi dalla lista di ricerca
      setSearchResults(prev => prev.filter(p => p.id !== otherId));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’invio della richiesta.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
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

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setTab('friends')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'friends'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            Amici
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'requests'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            Richieste
          </button>
          <button
            onClick={() => setTab('search')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'search'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            Cerca utenti
          </button>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        {/* Contenuto tab */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {/* Colonna sinistra: amici / richieste / cerca */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 overflow-y-auto">
            {tab === 'friends' && (
              <>
                <h2 className="text-sm font-semibold mb-3">
                  Amici ({acceptedFriends.length})
                </h2>
                {loadingFriends ? (
                  <p className="text-xs text-slate-300">
                    Carico gli amici...
                  </p>
                ) : acceptedFriends.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Nessun amico ancora. Vai nella scheda &quot;Cerca
                    utenti&quot; per aggiungerne uno!
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {acceptedFriends.map(f => {
                      const otherId =
                        f.requester_id === user.id
                          ? f.addressee_id
                          : f.requester_id;
                      const p = profilesMap[otherId];
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between"
                        >
                          <span>
                            {p
                              ? p.display_name ||
                                p.username ||
                                p.id
                              : otherId}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {tab === 'requests' && (
              <>
                <h2 className="text-sm font-semibold mb-2">
                  Richieste in arrivo
                </h2>
                {incomingRequests.length === 0 ? (
                  <p className="text-xs text-slate-400 mb-3">
                    Nessuna richiesta in arrivo.
                  </p>
                ) : (
                  <ul className="space-y-2 mb-4 text-sm">
                    {incomingRequests.map(f => {
                      const p = profilesMap[f.requester_id];
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            {p
                              ? p.display_name ||
                                p.username ||
                                p.id
                              : f.requester_id}
                          </span>
                          <button
                            onClick={() => handleAccept(f.id)}
                            className="text-xs px-3 py-1 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
                          >
                            Accetta
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <h2 className="text-sm font-semibold mb-2">
                  Richieste inviate
                </h2>
                {outgoingRequests.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Nessuna richiesta inviata.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {outgoingRequests.map(f => {
                      const p = profilesMap[f.addressee_id];
                      return (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span>
                            {p
                              ? p.display_name ||
                                p.username ||
                                p.id
                              : f.addressee_id}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            In attesa...
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {tab === 'search' && (
              <>
                <h2 className="text-sm font-semibold mb-3">
                  Cerca utenti per username
                </h2>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="es. mario.rossi"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searchLoading}
                    className="px-4 py-2 rounded-xl bg-amber-400 text-slate-900 text-sm font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {searchLoading ? 'Cerco...' : 'Cerca'}
                  </button>
                </div>
                {searchResults.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Nessun risultato ancora. Prova a cercare un username
                    esistente.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {searchResults.map(p => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {p.display_name || p.username || p.id}
                        </span>
                        <button
                          onClick={() => handleAddFriend(p.id)}
                          className="text-xs px-3 py-1 rounded-full border border-amber-400 text-amber-300 hover:bg-amber-400 hover:text-slate-900"
                        >
                          Aggiungi amico
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Colonna destra: classifica */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Classifica pizze</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setYear(y => y - 1)}
                  className="px-2 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                >
                  ◀
                </button>
                <span className="text-xs text-slate-300">
                  {year}
                </span>
                <button
                  onClick={() => setYear(y => y + 1)}
                  className="px-2 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                >
                  ▶
                </button>
              </div>
            </div>

            {leaderboardLoading ? (
                <p className="text-xs text-slate-300">
                    Carico la classifica...
                </p>
                ) : leaderboard.length === 0 ? (
                <p className="text-xs text-slate-400">
                    Nessun dato per la classifica ancora. Aggiungi qualche
                    amico e registra qualche pizza!
                </p>
                ) : (
                <ul className="space-y-2 text-sm">
                    {leaderboard.map((row, index) => {
                    const p = row.profile;
                    const label = p
                        ? p.display_name || p.username || row.userId
                        : row.userId;

                    return (
                        <li
                        key={row.userId}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl ${
                            row.isMe
                            ? 'bg-amber-400/10 border border-amber-300/60'
                            : 'bg-slate-900/60 border border-slate-700'
                        }`}
                        >
                        <div className="flex items-center gap-3">
                            <span className="text-xs w-4 text-slate-400">
                            {index + 1}.
                            </span>
                            <span className="text-sm">
                            {p?.username ? (
                                <Link
                                href={`/u/${p.username}`}
                                className="hover:underline"
                                >
                                {label}
                                </Link>
                            ) : (
                                label
                            )}
                            {row.isMe && (
                                <span className="ml-1 text-[10px] text-amber-300">
                                (tu)
                                </span>
                            )}
                            </span>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-semibold">
                            {row.total} pizze
                            </p>
                            <p className="text-[10px] text-slate-400">
                            {row.baseCount} di partenza + {row.pizzaCount} qui
                            </p>
                        </div>
                        </li>
                    );
                    })}
                </ul>
                )}

          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

export default function FriendsPage() {
  return (
    <ProtectedRoute>
      <FriendsPageContent />
    </ProtectedRoute>
  );
}
