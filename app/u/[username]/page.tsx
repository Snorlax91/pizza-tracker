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

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  pizza_visibility: 'everyone' | 'friends' | 'groups' | 'none';
};

type PizzaListItem = {
  id: number;
  name: string;
  eaten_at: string | null;
  rating: number | null;
  notes: string | null;
  photo_url: string | null;
  has_details: boolean | null;
  ingredients: { id: number; name: string }[];
};

const CURRENT_YEAR = new Date().getFullYear();

export default function PublicUserPizzasPage() {
  const router = useRouter();
  const params = useParams();
  const usernameParam = params?.username as string | undefined;

  const [viewer, setViewer] = useState<User | null>(null);
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [pizzas, setPizzas] = useState<PizzaListItem[]>([]);
  const [loadingPizzas, setLoadingPizzas] = useState(false);

  const [isFriend, setIsFriend] = useState(false);
  const [sharesGroup, setSharesGroup] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
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

        setViewer({ id: user.id, email: user.email ?? undefined });

        if (!usernameParam) {
          setErrorMsg('Nessun utente specificato.');
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(
            'id, username, display_name, pizza_visibility'
          )
          .eq('username', usernameParam)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) {
          setErrorMsg('Utente non trovato.');
          setLoading(false);
          return;
        }

        setTargetProfile(profile as Profile);

        const targetId = profile.id as string;
        const viewerId = user.id;

        if (viewerId === targetId) {
          setIsFriend(false);
          setSharesGroup(false);
          setLoading(false);
          return;
        }

        const { data: friendships, error: fError } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(
            `requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`
          );

        if (fError) throw fError;

        const friend = (friendships ?? []).some(
          f =>
            f.status === 'accepted' &&
            (f.requester_id === targetId ||
              f.addressee_id === targetId)
        );
        setIsFriend(friend);

        const { data: gm, error: gmError } = await supabase
          .from('group_members')
          .select('group_id, user_id, status')
          .eq('status', 'active')
          .in('user_id', [viewerId, targetId]);

        if (gmError) throw gmError;

        const groupsByUser: Record<string, Set<number>> = {};
        (gm ?? []).forEach(row => {
          if (!groupsByUser[row.user_id]) {
            groupsByUser[row.user_id] = new Set();
          }
          groupsByUser[row.user_id].add(row.group_id);
        });

        const viewerGroups = groupsByUser[viewerId] || new Set<number>();
        const targetGroups = groupsByUser[targetId] || new Set<number>();
        let common = false;
        viewerGroups.forEach(gid => {
          if (targetGroups.has(gid)) common = true;
        });
        setSharesGroup(common);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nel caricamento del profilo utente.'
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router, usernameParam]);

  useEffect(() => {
    const loadPizzas = async () => {
      if (!targetProfile) return;
      if (!viewer) return;

      const isSelf = viewer.id === targetProfile.id;

      const canSeePizzas = (() => {
        if (isSelf) return true;
        switch (targetProfile.pizza_visibility) {
          case 'everyone':
            return true;
          case 'friends':
            return isFriend;
          case 'groups':
            return sharesGroup;
          case 'none':
          default:
            return false;
        }
      })();

      if (!canSeePizzas) {
        setPizzas([]);
        return;
      }

      setLoadingPizzas(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase
          .from('pizzas')
          .select(
            `
          id,
          name,
          eaten_at,
          rating,
          notes,
          photo_url,
          has_details,
          pizza_ingredients (
            ingredients (
              id,
              name
            )
          )
        `
          )
          .eq('user_id', targetProfile.id)
          .gte('eaten_at', `${year}-01-01`)
          .lte('eaten_at', `${year}-12-31`)
          .order('eaten_at', { ascending: false });

        if (error) throw error;

        const mapped: PizzaListItem[] =
          data?.map((row: any) => ({
            id: row.id,
            name: row.name,
            eaten_at: row.eaten_at,
            rating: row.rating,
            notes: row.notes,
            photo_url: row.photo_url,
            has_details: row.has_details,
            ingredients:
              row.pizza_ingredients?.map((pi: any) => pi.ingredients) ?? [],
          })) ?? [];

        setPizzas(mapped);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nel caricamento delle pizze.'
        );
      } finally {
        setLoadingPizzas(false);
      }
    };

    if (targetProfile && viewer) {
      loadPizzas();
    }
  }, [targetProfile, viewer, year, isFriend, sharesGroup]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p>Caricamento...</p>
      </main>
    );
  }

  if (!targetProfile) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <p className="text-sm text-red-400">
          Utente non trovato o non accessibile.
        </p>
      </main>
    );
  }

  const isSelf = viewer?.id === targetProfile.id;
  const name =
    targetProfile.display_name || targetProfile.username || 'Utente';

  const canSeePizzas = (() => {
    if (!viewer) return false;
    if (isSelf) return true;
    switch (targetProfile.pizza_visibility) {
      case 'everyone':
        return true;
      case 'friends':
        return isFriend;
      case 'groups':
        return sharesGroup;
      case 'none':
      default:
        return false;
    }
  })();

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        
      <AppHeader />

      <div className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full">
        {errorMsg && (
          <p className="mb-3 text-sm text-red-400">{errorMsg}</p>
        )}

        <div className="mb-4">
          <p className="text-sm text-slate-300">
            {isSelf
              ? 'Questa è la vista pubblica delle tue pizze.'
              : `Stai guardando le pizze di ${name}.`}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={() => setYear(y => y - 1)}
            className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
          >
            ◀
          </button>
          <span className="text-sm text-slate-300">
            Pizze del{' '}
            <span className="font-semibold text-slate-50">{year}</span>
          </span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
          >
            ▶
          </button>
        </div>

        {!canSeePizzas ? (
          <p className="text-sm text-slate-400 text-center">
            Questo utente non condivide la lista delle sue pizze con te.
          </p>
        ) : loadingPizzas ? (
          <p className="text-sm text-slate-300 text-center">
            Carico le pizze...
          </p>
        ) : pizzas.length === 0 ? (
          <p className="text-sm text-slate-400 text-center">
            Nessuna pizza registrata per il {year}.
          </p>
        ) : (
          <div className="space-y-3">
            {pizzas.map(pizza => (
              <div
                key={pizza.id}
                className="w-full text-left bg-slate-800/70 border border-slate-700 rounded-2xl overflow-hidden flex"
              >
                {pizza.photo_url && (
                  <div className="w-24 h-24 flex-shrink-0">
                    <img
                      src={pizza.photo_url}
                      alt={pizza.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h2 className="text-sm font-semibold text-slate-50">
                      {pizza.name}
                    </h2>
                    {typeof pizza.rating === 'number' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-semibold">
                        {pizza.rating}/10
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mb-1">
                    {pizza.eaten_at
                      ? new Date(pizza.eaten_at).toLocaleDateString()
                      : 'Data non impostata'}
                  </p>
                  {pizza.ingredients.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {pizza.ingredients.map(ing => (
                        <span
                          key={ing.id}
                          className="px-2 py-0.5 rounded-full text-[10px] bg-slate-900 border border-slate-600 text-slate-100"
                        >
                          {ing.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {pizza.notes && (
                    <p className="text-xs text-slate-300">
                      {pizza.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
