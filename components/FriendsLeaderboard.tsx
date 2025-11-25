'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type LeaderboardRow = {
  userId: string;
  profile: Profile | null;
  total: number;
  isMe: boolean;
};

type Friendship = {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: string;
};

const CURRENT_YEAR = new Date().getFullYear();

export function FriendsLeaderboard({ userId }: { userId: string }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFriendsLeaderboard = async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);

      try {
        // Carica le amicizie accettate
        const { data: friendships, error: fError } = await supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .eq('status', 'accepted');

        if (fError) throw fError;

        const friends = friendships ?? [];
        const friendIds = new Set<string>();
        friends.forEach(f => {
          const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
          friendIds.add(otherId);
        });

        // Include anche te stesso
        const participants = [userId, ...Array.from(friendIds)];

        if (participants.length === 0) {
          setLeaderboard([]);
          return;
        }

        // Carica i profili
        const { data: profiles, error: pError } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', participants);

        if (pError) throw pError;

        const profilesMap: Record<string, Profile> = {};
        (profiles ?? []).forEach(p => {
          profilesMap[p.id] = p as Profile;
        });

        // Carica base_count per l'anno corrente
        const { data: yearly, error: yearlyError } = await supabase
          .from('user_yearly_counters')
          .select('user_id, base_count')
          .eq('year', CURRENT_YEAR)
          .in('user_id', participants);

        if (yearlyError) throw yearlyError;

        const baseMap: Record<string, number> = {};
        (yearly ?? []).forEach(row => {
          baseMap[row.user_id] = row.base_count ?? 0;
        });

        // Carica pizze dell'anno corrente
        const { data: pizzas, error: pizzasError } = await supabase
          .from('pizzas')
          .select('user_id')
          .in('user_id', participants)
          .gte('eaten_at', `${CURRENT_YEAR}-01-01`)
          .lte('eaten_at', `${CURRENT_YEAR}-12-31`);

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

        // Crea la classifica
        const rows: LeaderboardRow[] = participants.map(uid => ({
          userId: uid,
          profile: profilesMap[uid] ?? null,
          total: (baseMap[uid] ?? 0) + (countMap[uid] ?? 0),
          isMe: uid === userId,
        }));

        rows.sort((a, b) => b.total - a.total);

        // Prendi solo i top 10
        setLeaderboard(rows.slice(0, 10));
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Errore nel caricamento della classifica amici.');
      } finally {
        setLoading(false);
      }
    };

    loadFriendsLeaderboard();
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
        <p className="text-xs text-slate-400">Carico la classifica amici...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <Link href="/friends" className="block no-underline">
        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 hover:bg-slate-800 transition-colors cursor-pointer">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">
            🏆 Classifica Amici
          </h3>
          <p className="text-xs text-slate-400">
            Nessun amico ancora. Aggiungi degli amici per vedere la classifica!
          </p>
          <p className="text-[10px] text-slate-500 mt-3 text-center">
            Clicca qui per aggiungere amici →
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/friends" className="block no-underline">
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 hover:bg-slate-800 transition-colors cursor-pointer">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          🏆 Classifica Amici {CURRENT_YEAR}
        </h3>
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
                  <span className="text-[10px] w-4 text-slate-400 flex-shrink-0">
                    {index + 1}.
                  </span>
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
        <p className="text-[10px] text-slate-500 mt-3 text-center">
          Clicca per vedere tutti gli amici →
        </p>
      </div>
    </Link>
  );
}
