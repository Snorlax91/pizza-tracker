'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
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

type LeaderboardRow = {
  userId: string;
  profile: Profile | null;
  total: number;
  isMe: boolean;
};

const CURRENT_YEAR = new Date().getFullYear();

export function GroupLeaderboard({ userId }: { userId: string }) {
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carica i gruppi dell'utente
  useEffect(() => {
    const loadMyGroups = async () => {
      if (!userId) return;

      try {
        // Membership attive dell'utente
        const { data: mData, error: mError } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', userId)
          .eq('status', 'active');

        if (mError) throw mError;

        const myGroupIds = (mData ?? []).map(m => m.group_id);

        if (myGroupIds.length === 0) {
          setMyGroups([]);
          return;
        }

        // Carica i gruppi
        const { data: groups, error: gError } = await supabase
          .from('groups')
          .select('id, name, description, visibility, owner_id')
          .in('id', myGroupIds);

        if (gError) throw gError;

        const groupsList = (groups ?? []) as Group[];
        setMyGroups(groupsList);

        // Carica il gruppo preferito dal localStorage
        try {
          const key = `favorite_group_${userId}`;
          const raw = localStorage.getItem(key);
          if (raw) {
            const favoriteId = parseInt(raw, 10);
            if (!Number.isNaN(favoriteId) && groupsList.some(g => g.id === favoriteId)) {
              setSelectedGroupId(favoriteId);
              return;
            }
          }
        } catch (err) {
          console.warn('Errore nel leggere il gruppo preferito da localStorage', err);
        }

        // Se non c'è preferito, prendi il primo
        if (groupsList.length > 0) {
          setSelectedGroupId(groupsList[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Errore nel caricamento dei gruppi.');
      }
    };

    loadMyGroups();
  }, [userId]);

  // Carica la classifica del gruppo selezionato (modalità "intorno a me")
  useEffect(() => {
    const loadGroupLeaderboard = async () => {
      if (!userId || !selectedGroupId) return;

      setLoading(true);
      setError(null);

      try {
        // Carica il gruppo
        const { data: gData, error: gError } = await supabase
          .from('groups')
          .select('id, name, description, visibility, owner_id')
          .eq('id', selectedGroupId)
          .maybeSingle();

        if (gError) throw gError;
        if (!gData) {
          setError('Gruppo non trovato.');
          setLoading(false);
          return;
        }

        const group = gData as Group;

        // Carica membri attivi
        const { data: members, error: mError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', selectedGroupId)
          .eq('status', 'active');

        if (mError) throw mError;

        const participants = new Set<string>();
        participants.add(group.owner_id);
        (members ?? []).forEach(m => participants.add(m.user_id));

        const ids = Array.from(participants);

        if (ids.length === 0) {
          setLeaderboard([]);
          return;
        }

        // Carica profili
        const { data: profiles, error: pError } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', ids);

        if (pError) throw pError;

        const profilesMap: Record<string, Profile> = {};
        (profiles ?? []).forEach(p => {
          profilesMap[p.id] = p as Profile;
        });

        // Carica base_count
        const { data: yearly, error: yearlyError } = await supabase
          .from('user_yearly_counters')
          .select('user_id, base_count')
          .eq('year', CURRENT_YEAR)
          .in('user_id', ids);

        if (yearlyError) throw yearlyError;

        const baseMap: Record<string, number> = {};
        (yearly ?? []).forEach(row => {
          baseMap[row.user_id] = row.base_count ?? 0;
        });

        // Carica pizze
        const { data: pizzas, error: pizzasError } = await supabase
          .from('pizzas')
          .select('user_id')
          .in('user_id', ids)
          .gte('eaten_at', `${CURRENT_YEAR}-01-01`)
          .lte('eaten_at', `${CURRENT_YEAR}-12-31`);

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

        // Crea la classifica completa
        const allRows: LeaderboardRow[] = ids.map(uid => ({
          userId: uid,
          profile: profilesMap[uid] ?? null,
          total: (baseMap[uid] ?? 0) + (countMap[uid] ?? 0),
          isMe: uid === userId,
        }));

        allRows.sort((a, b) => b.total - a.total);

        // Modalità "intorno a me": 5 sopra + me + 5 sotto (o meno se non ci sono abbastanza)
        const myIdx = allRows.findIndex(r => r.userId === userId);
        if (myIdx === -1) {
          // Se non sono nella classifica (strano), mostra i top 11
          setLeaderboard(allRows.slice(0, 11));
        } else {
          const start = Math.max(0, myIdx - 5);
          const end = Math.min(allRows.length, myIdx + 6);
          setLeaderboard(allRows.slice(start, end));
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Errore nel caricamento della classifica.');
      } finally {
        setLoading(false);
      }
    };

    loadGroupLeaderboard();
  }, [userId, selectedGroupId]);

  const handleGroupChange = (groupId: number) => {
    setSelectedGroupId(groupId);
    // Salva in localStorage
    try {
      const key = `favorite_group_${userId}`;
      localStorage.setItem(key, groupId.toString());
    } catch (err) {
      console.warn('Errore nel salvare il gruppo preferito', err);
    }
  };

  if (myGroups.length === 0) {
    return (
      <Link href="/groups" className="block no-underline">
        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 hover:bg-slate-800 transition-colors cursor-pointer">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            👥 Classifica Gruppo
          </h3>
          <p className="text-xs text-slate-400">
            Non fai parte di nessun gruppo. Unisciti o crea un gruppo per vedere la classifica!
          </p>
          <p className="text-[10px] text-slate-500 mt-3 text-center">
            Clicca qui per esplorare i gruppi →
          </p>
        </div>
      </Link>
    );
  }

  const selectedGroup = myGroups.find(g => g.id === selectedGroupId);

  return (
    <Link 
      href={selectedGroupId ? `/groups/${selectedGroupId}` : '/groups'} 
      className="block no-underline"
    >
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 hover:bg-slate-800 transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300">
            👥 Classifica Gruppo
          </h3>
          {myGroups.length > 1 && (
            <select
              value={selectedGroupId ?? ''}
              onChange={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGroupChange(parseInt(e.target.value, 10));
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:ring focus:ring-slate-500"
            >
              {myGroups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedGroup && (
          <p className="text-[10px] text-slate-500 mb-2">
            {selectedGroup.name}
          </p>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Carico la classifica...</p>
        ) : error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-xs text-slate-400">Nessun membro nel gruppo.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row, index) => {
              const p = row.profile;
              const label = p ? p.display_name || p.username || row.userId : row.userId;

              return (
                <div
                  key={row.userId}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg ${
                    row.isMe
                      ? 'bg-amber-400/10 border border-amber-300/60'
                      : 'bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs truncate">
                      {label}
                      {row.isMe && (
                        <span className="ml-1 text-[9px] text-amber-300">(tu)</span>
                      )}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-300 flex-shrink-0">
                    {row.total}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-slate-500 mt-3 text-center">
          Clicca per vedere il gruppo completo →
        </p>
      </div>
    </Link>
  );
}
