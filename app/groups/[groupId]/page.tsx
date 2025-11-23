'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';

type User = {
  id: string;
  email?: string;
};

type Group = {
  id: number;
  name: string;
  description: string | null;
  visibility: 'public' | 'closed' | 'private';
  owner_id: string;
};

type Membership = {
  id: number;
  group_id: number;
  user_id: string;
  role: 'member' | 'admin';
  status: 'pending' | 'active';
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
const LEADERBOARD_PAGE_SIZE = 10;

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupIdParam = params?.groupId as string | undefined;

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [group, setGroup] = useState<Group | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardPage, setLeaderboardPage] = useState(0);

  // inviti / aggiunta membri
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);
  const [searchingInvite, setSearchingInvite] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // carica utente
  useEffect(() => {
    const loadUser = async () => {
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

      setUser({ id: user.id, email: user.email ?? undefined });
      setLoadingUser(false);
    };

    loadUser();
  }, [router]);

  // carica gruppo + membership + membri
  useEffect(() => {
    const loadGroup = async () => {
      if (!user) return;
      if (!groupIdParam) return;

      const groupId = parseInt(groupIdParam, 10);
      if (Number.isNaN(groupId)) {
        setErrorMsg('ID gruppo non valido.');
        return;
      }

      setLoadingGroup(true);
      setErrorMsg(null);

      try {
        const { data: gData, error: gError } = await supabase
          .from('groups')
          .select('id, name, description, visibility, owner_id')
          .eq('id', groupId)
          .maybeSingle();

        if (gError) throw gError;
        if (!gData) {
          setErrorMsg('Gruppo non trovato o non accessibile.');
          setLoadingGroup(false);
          return;
        }

        const group = gData as Group;
        setGroup(group);

        // membership dell'utente
        const { data: mData, error: mError } = await supabase
          .from('group_members')
          .select('id, group_id, user_id, role, status')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (mError && mError.code !== 'PGRST116') throw mError;
        setMembership((mData as Membership) || null);

        // membri del gruppo (se sei membro o owner, le policy permettono tutto)
        const { data: allMembers, error: allError } = await supabase
          .from('group_members')
          .select('id, group_id, user_id, role, status')
          .eq('group_id', groupId);

        if (allError) {
          // se non sei membro potresti non vedere i membri: non è grave
          console.warn('Impossibile caricare la lista membri:', allError);
        } else {
          const members = (allMembers ?? []) as Membership[];
          setMembers(members);

          // profili
          const ids = new Set<string>();
          ids.add(group.owner_id);
          members.forEach(m => ids.add(m.user_id));

          if (ids.size > 0) {
            const { data: profiles, error: pError } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', Array.from(ids));

            if (pError) throw pError;

            const map: Record<string, Profile> = {};
            (profiles ?? []).forEach(p => {
              map[p.id] = p as Profile;
            });
            setProfilesMap(map);
          }
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message ?? 'Errore nel caricamento del gruppo.');
      } finally {
        setLoadingGroup(false);
      }
    };

    if (user) {
      loadGroup();
    }
  }, [user, groupIdParam]);

  // classifica del gruppo
  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!group || !user) return;
      setLeaderboardLoading(true);
      setErrorMsg(null);

      try {
        // identifica i membri attivi del gruppo
        const activeMembers = members
          .filter(m => m.status === 'active')
          .map(m => m.user_id);

        const participants = new Set<string>();
        participants.add(group.owner_id);
        activeMembers.forEach(id => participants.add(id));

        const ids = Array.from(participants);
        if (ids.length === 0) {
          setLeaderboard([]);
          setLeaderboardPage(0);
          return;
        }

        // base_count per anno
        const { data: yearly, error: yearlyError } = await supabase
          .from('user_yearly_counters')
          .select('user_id, base_count')
          .eq('year', year)
          .in('user_id', ids);

        if (yearlyError) throw yearlyError;

        const baseMap: Record<string, number> = {};
        (yearly ?? []).forEach(row => {
          baseMap[row.user_id] = row.base_count ?? 0;
        });

        // pizze per anno (solo user_id, filtro sui partecipanti)
        const { data: pizzas, error: pizzasError } = await supabase
          .from('pizzas')
          .select('user_id')
          .in('user_id', ids)
          .gte('eaten_at', `${year}-01-01`)
          .lte('eaten_at', `${year}-12-31`);

        if (pizzasError) throw pizzasError;

        const countMap: Record<string, number> = {};
        ids.forEach(id => {
          countMap[id] = 0;
        });

        (pizzas ?? []).forEach(row => {
          if (row.user_id in countMap) {
            countMap[row.user_id] += 1;
          }
        });

        const rows: LeaderboardRow[] = ids.map(uid => ({
          userId: uid,
          profile: profilesMap[uid] ?? null,
          baseCount: baseMap[uid] ?? 0,
          pizzaCount: countMap[uid] ?? 0,
          total: (baseMap[uid] ?? 0) + (countMap[uid] ?? 0),
          isMe: uid === user.id,
        }));

        rows.sort((a, b) => b.total - a.total);

        setLeaderboard(rows);
        setLeaderboardPage(0);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message ?? 'Errore nel calcolo della classifica.');
      } finally {
        setLeaderboardLoading(false);
      }
    };

    if (group) {
      loadLeaderboard();
    }
  }, [group, members, year, profilesMap, user]);

  // cerca profili da invitare / aggiungere
  const handleSearchInvite = async () => {
    if (!group || !user) return;
    const q = inviteQuery.trim();
    if (!q) {
      setInviteResults([]);
      return;
    }

    setSearchingInvite(true);
    setInviteError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10);

      if (error) throw error;

      // escludi chi è già membro
      const memberIds = new Set(members.map(m => m.user_id));
      const filtered = (data ?? []).filter(p => !memberIds.has(p.id));

      setInviteResults(filtered);
    } catch (err: any) {
      console.error(err);
      setInviteError(err.message ?? 'Errore nella ricerca utenti.');
    } finally {
      setSearchingInvite(false);
    }
  };

  // aggiungi un membro al gruppo (owner → insert group_members)
  const handleAddMember = async (profileId: string) => {
    if (!group || !user) return;
    setInvitingId(profileId);
    setInviteError(null);

    try {
      const { data, error } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: profileId,
          role: 'member',
          status: 'active',
        })
        .select('id, group_id, user_id, role, status')
        .single();

      if (error) throw error;

      const newMember = data as Membership;

      // aggiorna lista membri
      setMembers(prev => [...prev, newMember]);

      // rimuovi dai risultati e pulisci query
      setInviteResults(prev => prev.filter(p => p.id !== profileId));
      setInviteQuery('');
    } catch (err: any) {
      console.error(err);
      setInviteError(
        err.message ?? 'Errore nell’aggiunta dell’utente al gruppo.'
      );
    } finally {
      setInvitingId(null);
    }
  };

  const handleJoin = async () => {
    if (!user || !group) return;
    setErrorMsg(null);

    try {
      const status = group.visibility === 'public' ? 'active' : 'pending';

      const { data, error } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'member',
          status,
        })
        .select('id, group_id, user_id, role, status')
        .single();

      if (error) throw error;

      const m = data as Membership;
      setMembership(m);
      setMembers(prev => [...prev, m]);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’unirsi al gruppo.');
    }
  };

  const handleLeave = async () => {
    if (!user || !membership) return;
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', membership.id);

      if (error) throw error;

      setMembership(null);
      setMembers(prev => prev.filter(m => m.id !== membership.id));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’uscire dal gruppo.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  if (loadingUser || (loadingGroup && !group)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p>Caricamento...</p>
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

  if (!group) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p className="text-sm text-red-400">
          Gruppo non trovato o non accessibile.
        </p>
      </main>
    );
  }

  const isOwner = group.owner_id === user.id;
  const isMemberActive = membership?.status === 'active';
  const isPending = membership?.status === 'pending';

  const getProfileName = (id: string) => {
    const p = profilesMap[id];
    return p?.display_name || p?.username || id;
  };

  // leaderboard paginata: mostriamo solo i primi N * (page + 1)
  const displayedLeaderboard = leaderboard.slice(
    0,
    (leaderboardPage + 1) * LEADERBOARD_PAGE_SIZE
  );
  const leaderboardHasMore =
    displayedLeaderboard.length < leaderboard.length;

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader />

      <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
        {errorMsg && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Info gruppo */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Informazioni</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 text-slate-300">
                {group.visibility === 'public'
                  ? 'Pubblico'
                  : group.visibility === 'closed'
                  ? 'Chiuso'
                  : 'Privato'}
              </span>
            </div>
            {group.description && (
              <p className="text-xs text-slate-300">
                {group.description}
              </p>
            )}
            <p className="text-xs text-slate-400">
              Proprietario: {getProfileName(group.owner_id)}
            </p>

            <div className="mt-2">
              {isOwner && (
                <p className="text-xs text-amber-300">
                  Sei il proprietario del gruppo.
                </p>
              )}
              {!isOwner && (
                <>
                  {isMemberActive && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300">
                        Sei membro attivo del gruppo.
                      </span>
                      <button
                        onClick={handleLeave}
                        className="px-3 py-1 rounded-full border border-red-500 text-red-300 text-xs hover:bg-red-500/10"
                      >
                        Esci
                      </button>
                    </div>
                  )}
                  {isPending && (
                    <p className="text-xs text-slate-300">
                      Richiesta inviata, in attesa di approvazione.
                    </p>
                  )}
                  {!membership && !isMemberActive && !isPending && (
                    <button
                      onClick={handleJoin}
                      className="mt-1 px-3 py-1.5 rounded-full bg-amber-400 text-slate-900 text-xs font-semibold hover:bg-amber-300"
                    >
                      {group.visibility === 'public'
                        ? 'Unisciti al gruppo'
                        : 'Richiedi di unirti'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Classifica */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Classifica del gruppo
              </h2>
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
            ) : displayedLeaderboard.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nessun dato per la classifica ancora. Appena i membri
                iniziano a registrare pizze, compariranno qui.
              </p>
            ) : (
              <>
                <ul className="space-y-2 text-sm">
                  {displayedLeaderboard.map((row, index) => {
                    const profile = row.profile;
                    const username = profile?.username ?? null;
                    const label =
                      profile?.display_name ||
                      profile?.username ||
                      row.userId;

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

                {leaderboardHasMore && (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setLeaderboardPage(p => p + 1)
                      }
                      className="text-xs px-4 py-1.5 rounded-full border border-slate-700 hover:bg-slate-900"
                    >
                      Mostra altri
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Membri del gruppo */}
        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-2">Membri</h2>
          {members.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nessun membro visibile oppure non hai i permessi per vedere
              la lista.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-3 text-xs">
              {members.map(m => {
                const p = profilesMap[m.user_id];
                const username = p?.username || null;
                const label = getProfileName(m.user_id);

                return (
                  <li
                    key={m.id}
                    className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-700"
                  >
                    <span className="font-semibold">
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
                    </span>
                    {m.user_id === group.owner_id && (
                      <span className="ml-1 text-[10px] text-amber-300">
                        (owner)
                      </span>
                    )}
                    {m.user_id === user.id && (
                      <span className="ml-1 text-[10px] text-emerald-300">
                        (tu)
                      </span>
                    )}
                    {m.status === 'pending' && (
                      <span className="ml-1 text-[10px] text-slate-400">
                        pending
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Inviti / aggiunta membri per gruppi chiusi (owner) */}
          {isOwner && group.visibility === 'closed' && (
            <div className="mt-4 bg-slate-900/70 border border-slate-700 rounded-2xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-100">
                Invita persone nel gruppo chiuso
              </p>
              <p className="text-[11px] text-slate-400">
                Cerca per nickname o nome visibile e aggiungi membri
                direttamente.
              </p>

              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={e => setInviteQuery(e.target.value)}
                  placeholder="Cerca per nickname..."
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs focus:outline-none focus:ring focus:ring-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSearchInvite}
                  className="text-xs px-3 py-2 rounded-xl border border-slate-700 text-slate-100 hover:bg-slate-800"
                  disabled={searchingInvite}
                >
                  {searchingInvite ? 'Cerco...' : 'Cerca'}
                </button>
              </div>

              {inviteError && (
                <p className="text-[11px] text-red-400">
                  {inviteError}
                </p>
              )}

              {inviteResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {inviteResults.map(profile => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between text-xs bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-slate-100">
                          {profile.display_name || profile.username}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          @{profile.username}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddMember(profile.id)}
                        disabled={invitingId === profile.id}
                        className="text-[11px] px-3 py-1 rounded-full border border-amber-400/70 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        {invitingId === profile.id
                          ? 'Aggiungo...'
                          : 'Aggiungi al gruppo'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searchingInvite &&
                inviteResults.length === 0 &&
                inviteQuery.trim() && (
                  <p className="text-[11px] text-slate-500">
                    Nessun utente trovato con questa ricerca (o è già nel
                    gruppo).
                  </p>
                )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
