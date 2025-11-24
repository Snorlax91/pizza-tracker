'use client';

import { useEffect, useState, useMemo } from 'react';
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

type LeaderboardViewMode = 'aroundMe' | 'top' | 'search';

type WeeklyData = {
  weekNumber: number;
  weekLabel: string;
  data: Record<string, number>; // userId -> valore (posizione o count)
};

type ChartMode = 'position' | 'pizzas';
type ChartViewMode = 'top10' | 'aroundMe';

const CURRENT_YEAR = new Date().getFullYear();

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

  // vista classifica
  const [viewMode, setViewMode] = useState<LeaderboardViewMode>('aroundMe');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // inviti / aggiunta membri
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);
  const [searchingInvite, setSearchingInvite] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // grafico settimanale
  const [chartMode, setChartMode] = useState<ChartMode>('pizzas');
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('top10');
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

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
        // reset vista quando cambiamo anno / gruppo
        setViewMode('aroundMe');
        setSearchResultIndex(null);
        setSearchError(null);
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

  // carica dati settimanali per il grafico
  useEffect(() => {
    const loadWeeklyData = async () => {
      if (!group || !user || leaderboard.length === 0) return;
      
      setLoadingChart(true);

      try {
        // identifica i partecipanti da mostrare nel grafico
        let participantIds: string[];
        
        if (chartViewMode === 'top10') {
          // Top 10 + me stesso se non sono nei top 10
          const top10 = leaderboard.slice(0, 10).map(r => r.userId);
          if (!top10.includes(user.id)) {
            participantIds = [...top10, user.id];
          } else {
            participantIds = top10;
          }
        } else {
          // Intorno a me: 5 sopra e 5 sotto + me stesso
          const myIdx = leaderboard.findIndex(r => r.userId === user.id);
          if (myIdx === -1) {
            participantIds = leaderboard.slice(0, 11).map(r => r.userId);
          } else {
            const start = Math.max(0, myIdx - 5);
            const end = Math.min(leaderboard.length, myIdx + 6);
            participantIds = leaderboard.slice(start, end).map(r => r.userId);
          }
        }

        // DATI FITTIZI PER TEST
        console.log('🧪 Caricamento dati fittizi per test grafico');
        const currentWeek = getWeekNumber(new Date());
        const startWeek = Math.max(1, currentWeek - 10);
        const testWeekly: WeeklyData[] = [];
        
        for (let w = startWeek; w <= currentWeek; w++) {
          const weekData: Record<string, number> = {};
          
          participantIds.forEach((uid, idx) => {
            if (chartMode === 'pizzas') {
              // Genera un numero crescente di pizze
              const base = idx * 5;
              const increment = (w - startWeek) * (idx + 1);
              weekData[uid] = base + increment;
            } else {
              // Genera posizioni che cambiano leggermente
              const basePos = idx + 1;
              const variation = Math.sin(w / 2) * 2;
              weekData[uid] = Math.max(1, Math.round(basePos + variation));
            }
          });
          
          testWeekly.push({
            weekNumber: w,
            weekLabel: `S${w}`,
            data: weekData,
          });
        }
        
        console.log('🧪 Dati fittizi generati:', testWeekly.length, 'settimane');
        console.log('🧪 Prima settimana:', testWeekly[0]);
        console.log('🧪 Ultima settimana:', testWeekly[testWeekly.length - 1]);
        
        setWeeklyData(testWeekly);
        setLoadingChart(false);
        return;
        // FINE DATI FITTIZI

        // calcola il numero di settimane nell'anno
        const weeksInYear = getWeeksInYear(year);
        
        // carica tutte le pizze dell'anno per i partecipanti
        const { data: pizzas, error: pizzasError } = await supabase
          .from('pizzas')
          .select('user_id, eaten_at')
          .in('user_id', participantIds)
          .gte('eaten_at', `${year}-01-01`)
          .lte('eaten_at', `${year}-12-31`);

        if (pizzasError) throw pizzasError;

        // organizza pizze per settimana e utente
        // Usa il numero di settimana ISO come chiave
        const weeklyCountsMap: Record<number, Record<string, number>> = {};
        
        // Inizializza tutte le settimane possibili (da 1 a 53)
        for (let w = 1; w <= 53; w++) {
          weeklyCountsMap[w] = {};
          participantIds.forEach(uid => {
            weeklyCountsMap[w][uid] = 0;
          });
        }

        (pizzas ?? []).forEach(pizza => {
          if (!pizza.eaten_at || !pizza.user_id) return;
          const date = new Date(pizza.eaten_at);
          const weekNum = getWeekNumber(date);
          if (weekNum >= 1 && weekNum <= 53 && participantIds.includes(pizza.user_id)) {
            weeklyCountsMap[weekNum][pizza.user_id] = 
              (weeklyCountsMap[weekNum][pizza.user_id] || 0) + 1;
          }
        });

        // Trova la prima e l'ultima settimana con dati
        let firstWeek = 1;
        let lastWeek = weeksInYear;
        
        // Opzionale: trova la prima settimana con almeno una pizza
        for (let w = 1; w <= weeksInYear; w++) {
          const hasData = participantIds.some(uid => weeklyCountsMap[w][uid] > 0);
          if (hasData) {
            firstWeek = w;
            break;
          }
        }
        
        // Trova l'ultima settimana con almeno una pizza
        for (let w = weeksInYear; w >= 1; w--) {
          const hasData = participantIds.some(uid => weeklyCountsMap[w][uid] > 0);
          if (hasData) {
            lastWeek = w;
            break;
          }
        }

        // calcola i dati settimanali in base al chartMode
        const weekly: WeeklyData[] = [];
        
        for (let w = firstWeek; w <= lastWeek; w++) {
          const weekLabel = `S${w}`;
          
          if (chartMode === 'pizzas') {
            // conta pizze per settimana (cumulativo per vedere la crescita)
            const cumulativeCounts: Record<string, number> = {};
            participantIds.forEach(uid => {
              cumulativeCounts[uid] = 0;
            });

            // somma tutte le pizze fino a questa settimana
            for (let i = 1; i <= w; i++) {
              participantIds.forEach(uid => {
                cumulativeCounts[uid] += weeklyCountsMap[i][uid] || 0;
              });
            }

            weekly.push({
              weekNumber: w,
              weekLabel,
              data: cumulativeCounts,
            });
          } else {
            // calcola posizioni cumulative
            const cumulativeCounts: Record<string, number> = {};
            participantIds.forEach(uid => {
              cumulativeCounts[uid] = 0;
            });

            // somma tutte le pizze fino a questa settimana
            for (let i = 1; i <= w; i++) {
              participantIds.forEach(uid => {
                cumulativeCounts[uid] += weeklyCountsMap[i][uid] || 0;
              });
            }

            // ordina per count e assegna posizioni
            const sorted = participantIds
              .map(uid => ({ uid, count: cumulativeCounts[uid] }))
              .sort((a, b) => b.count - a.count);

            const positions: Record<string, number> = {};
            sorted.forEach((item, idx) => {
              positions[item.uid] = idx + 1;
            });

            weekly.push({
              weekNumber: w,
              weekLabel,
              data: positions,
            });
          }
        }

        setWeeklyData(weekly);
      } catch (err) {
        console.error('Errore nel caricamento dati settimanali', err);
      } finally {
        setLoadingChart(false);
      }
    };

    loadWeeklyData();
  }, [group, leaderboard, year, user, chartMode, chartViewMode]);

  // helper: calcola numero settimana dell'anno (ISO 8601)
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  };

  const getWeeksInYear = (year: number): number => {
    const lastDay = new Date(year, 11, 31);
    return getWeekNumber(lastDay);
  };

  // indice del mio utente in classifica
  const myIndex = useMemo(() => {
    if (!user) return -1;
    return leaderboard.findIndex(row => row.userId === user.id);
  }, [leaderboard, user]);

  // gestione della ricerca nella classifica
  const handleLeaderboardSearch = () => {
    setSearchError(null);

    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      // se il campo è vuoto, torno alla vista "intorno a me"
      setSearchResultIndex(null);
      setViewMode('aroundMe');
      return;
    }

    const idx = leaderboard.findIndex(row => {
      const p = row.profile;
      const username = p?.username?.toLowerCase() || '';
      const dn = p?.display_name?.toLowerCase() || '';
      return username.includes(q) || dn.includes(q);
    });

    if (idx === -1) {
      setSearchResultIndex(null);
      setSearchError(
        'Nessun utente trovato in classifica con questo nome.'
      );
      return;
    }

    setSearchResultIndex(idx);
    setViewMode('search');
  };

  // finestra della classifica da mostrare
  const displayedLeaderboard = useMemo(() => {
    if (leaderboard.length === 0) return [];

    // finestra di 5 sopra e 5 sotto
    const windowSize = 5;

    if (viewMode === 'top') {
      return leaderboard.slice(0, 10);
    }

    const index =
      viewMode === 'aroundMe'
        ? myIndex
        : viewMode === 'search'
        ? searchResultIndex ?? -1
        : -1;

    if (index === -1) {
      // se non trovo me stesso o il risultato, fallback su top 10
      return leaderboard.slice(0, 10);
    }

    const start = Math.max(0, index - windowSize);
    const end = Math.min(leaderboard.length, index + windowSize + 1);
    return leaderboard.slice(start, end);
  }, [leaderboard, myIndex, viewMode, searchResultIndex]);

  const displayedRangeInfo = useMemo(() => {
    if (leaderboard.length === 0 || displayedLeaderboard.length === 0)
      return null;

    const firstIndex = leaderboard.findIndex(
      r => r.userId === displayedLeaderboard[0].userId
    );
    const lastIndex = leaderboard.findIndex(
      r =>
        r.userId ===
        displayedLeaderboard[displayedLeaderboard.length - 1].userId
    );

    if (firstIndex === -1 || lastIndex === -1) return null;

    return {
      startPos: firstIndex + 1,
      endPos: lastIndex + 1,
    };
  }, [leaderboard, displayedLeaderboard]);

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

  // componente grafico
  const WeeklyChart = () => {
    if (loadingChart) {
      return (
        <div className="h-64 flex items-center justify-center">
          <p className="text-xs text-slate-400">Carico il grafico...</p>
        </div>
      );
    }

    if (weeklyData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center">
          <p className="text-xs text-slate-400">Nessun dato disponibile</p>
        </div>
      );
    }

    // identifica gli utenti da mostrare
    const userIds = Object.keys(weeklyData[0].data);
    
    // colori per le linee
    const colors = [
      '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
      '#f97316', '#14b8a6', '#6366f1', '#a855f7', '#ef4444',
      '#84cc16',
    ];

    // trova min/max per scaling
    const allValues = weeklyData.flatMap(w => Object.values(w.data));
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = 800;
    const height = 300;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // scala X (settimane)
    const xStep = chartWidth / (weeklyData.length - 1 || 1);
    
    // scala Y
    const yRange = maxValue - minValue || 1;
    const yScale = (value: number) => {
      if (chartMode === 'position') {
        // inverti l'asse Y per le posizioni (1° in alto)
        return padding.top + ((value - minValue) / yRange) * chartHeight;
      } else {
        return padding.top + chartHeight - ((value - minValue) / yRange) * chartHeight;
      }
    };

    return (
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          style={{ maxHeight: '300px' }}
        >
          {/* Griglia orizzontale */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const value = minValue + ratio * yRange;
            const y = yScale(value);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {chartMode === 'position' 
                    ? `${Math.round(value)}°`
                    : Math.round(value)}
                </text>
              </g>
            );
          })}

          {/* Asse X (etichette settimane) */}
          {weeklyData.map((w, idx) => {
            if (idx % 4 !== 0 && idx !== weeklyData.length - 1) return null;
            const x = padding.left + idx * xStep;
            return (
              <text
                key={w.weekNumber}
                x={x}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {w.weekLabel}
              </text>
            );
          })}

          {/* Linee per ogni utente */}
          {userIds.map((uid, userIdx) => {
            const color = colors[userIdx % colors.length];
            const isMe = uid === user?.id;
            
            const points = weeklyData
              .map((w, idx) => {
                const value = w.data[uid] ?? (chartMode === 'position' ? maxValue : 0);
                const x = padding.left + idx * xStep;
                const y = yScale(value);
                return `${x},${y}`;
              })
              .join(' ');

            return (
              <g key={uid}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={isMe ? '3' : '2'}
                  opacity={isMe ? '1' : '0.7'}
                />
                {/* Punti */}
                {weeklyData.map((w, idx) => {
                  const value = w.data[uid] ?? (chartMode === 'position' ? maxValue : 0);
                  const x = padding.left + idx * xStep;
                  const y = yScale(value);
                  return (
                    <circle
                      key={`${uid}-${idx}`}
                      cx={x}
                      cy={y}
                      r={isMe ? '4' : '3'}
                      fill={color}
                      opacity={isMe ? '1' : '0.8'}
                    >
                      <title>
                        {getProfileName(uid)} - {w.weekLabel}: {
                          chartMode === 'position' 
                            ? `${value}° posto`
                            : `${value} pizze`
                        }
                      </title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          {/* Etichette assi */}
          <text
            x={width / 2}
            y={height - 5}
            textAnchor="middle"
            fontSize="11"
            fill="#cbd5e1"
            fontWeight="600"
          >
            Settimana
          </text>
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            fontSize="11"
            fill="#cbd5e1"
            fontWeight="600"
            transform={`rotate(-90 15 ${height / 2})`}
          >
            {chartMode === 'position' ? 'Posizione' : 'Pizze'}
          </text>
        </svg>

        {/* Leggenda */}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {userIds.map((uid, idx) => {
            const color = colors[idx % colors.length];
            const isMe = uid === user?.id;
            return (
              <div
                key={uid}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/60 border border-slate-700"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className={isMe ? 'font-bold text-amber-300' : 'text-slate-300'}>
                  {getProfileName(uid)}
                  {isMe && ' (tu)'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
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

              {/* Controlli vista + ricerca */}
              <div className="flex flex-wrap items-center gap-2 justify-between text-[11px]">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('aroundMe');
                      setSearchResultIndex(null);
                      setSearchError(null);
                    }}
                    className={`px-3 py-1 rounded-full border text-[11px] ${
                      viewMode === 'aroundMe'
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
                    className={`px-3 py-1 rounded-full border text-[11px] ${
                      viewMode === 'top'
                        ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                        : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    Top 10
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
                    onClick={handleLeaderboardSearch}
                    className="px-3 py-1 rounded-full border border-slate-700 text-[11px] hover:bg-slate-900"
                  >
                    Vai
                  </button>
                </div>
              </div>

              {searchError && (
                <p className="text-[11px] text-red-400">{searchError}</p>
              )}

              {leaderboard.length > 0 && displayedRangeInfo && (
                <p className="text-[11px] text-slate-400">
                  Stai vedendo le posizioni{' '}
                  <span className="font-semibold">
                    #{displayedRangeInfo.startPos}
                  </span>{' '}
                  -{' '}
                  <span className="font-semibold">
                    #{displayedRangeInfo.endPos}
                  </span>{' '}
                  su {leaderboard.length} membri.
                </p>
              )}
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
              <ul className="space-y-2 text-sm">
                {displayedLeaderboard.map(row => {
                  const profile = row.profile;
                  const username = profile?.username ?? null;
                  const label =
                    profile?.display_name ||
                    profile?.username ||
                    row.userId;

                  const globalIndex =
                    leaderboard.findIndex(
                      r => r.userId === row.userId
                    ) + 1; // 1-based

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
                        <span className="text-xs w-6 text-slate-400">
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

        {/* Grafico andamento settimanale */}
        {(isMemberActive || isOwner) && leaderboard.length > 0 && (
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Andamento settimanale {year}
                </h2>
                
                <div className="flex flex-wrap items-center gap-2">
                  {/* Toggle modalità grafico */}
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setChartMode('pizzas')}
                      className={`px-3 py-1 rounded-full border ${
                        chartMode === 'pizzas'
                          ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      Pizze/settimana
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode('position')}
                      className={`px-3 py-1 rounded-full border ${
                        chartMode === 'position'
                          ? 'bg-slate-900 border-amber-300/70 text-amber-200'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      Posizione
                    </button>
                  </div>

                  {/* Toggle vista */}
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setChartViewMode('top10')}
                      className={`px-3 py-1 rounded-full border ${
                        chartViewMode === 'top10'
                          ? 'bg-slate-900 border-emerald-300/70 text-emerald-200'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      Top 10
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartViewMode('aroundMe')}
                      className={`px-3 py-1 rounded-full border ${
                        chartViewMode === 'aroundMe'
                          ? 'bg-slate-900 border-emerald-300/70 text-emerald-200'
                          : 'border-slate-700 text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      Intorno a me
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                {chartMode === 'pizzas'
                  ? 'Numero totale di pizze registrate (cumulativo) fino a quella settimana'
                  : 'Posizione in classifica basata sul totale cumulativo fino a quella settimana'}
              </p>

              <WeeklyChart />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
