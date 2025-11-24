'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { ProtectedRoute } from '@/components/ProtectedRoute';

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

function GroupsPageContent() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [tab, setTab] = useState<'my' | 'explore' | 'create'>('my');

  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [exploreGroups, setExploreGroups] = useState<Group[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // form crea gruppo
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVisibility, setNewVisibility] = useState<
    'public' | 'closed' | 'private'
  >('public');
  const [creating, setCreating] = useState(false);

  // ricerca
  const [mySearch, setMySearch] = useState('');
  const [exploreSearch, setExploreSearch] = useState('');

  // preferiti (solo per "i miei gruppi", salvati in localStorage)
  const [favoriteGroupIds, setFavoriteGroupIds] = useState<number[]>([]);

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

  // Carica preferiti da localStorage quando ho l'utente
  useEffect(() => {
    if (!user) return;
    try {
      const key = `favorite_groups_${user.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavoriteGroupIds(parsed);
        }
      }
    } catch (err) {
      console.warn('Errore nel leggere i preferiti da localStorage', err);
    }
  }, [user]);

  const persistFavorites = (next: number[]) => {
    if (!user) return;
    try {
      const key = `favorite_groups_${user.id}`;
      localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn('Errore nel salvare i preferiti su localStorage', err);
    }
  };

  const toggleFavorite = (groupId: number) => {
    setFavoriteGroupIds(prev => {
      const exists = prev.includes(groupId);
      const next = exists
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId];
      persistFavorites(next);
      return next;
    });
  };

  // Carica gruppi e membership
  useEffect(() => {
    const loadGroups = async () => {
      if (!user) return;
      setLoadingGroups(true);
      setErrorMsg(null);

      try {
        // membership dell'utente
        const { data: mData, error: mError } = await supabase
          .from('group_members')
          .select('id, group_id, user_id, role, status')
          .eq('user_id', user.id);

        if (mError) throw mError;
        const memberships = (mData ?? []) as Membership[];
        setMemberships(memberships);

        const myGroupIds = memberships
          .filter(m => m.status === 'active')
          .map(m => m.group_id);

        // Gruppi dove sei owner o membro attivo
        const { data: myGroupsData, error: myError } = await supabase
          .from('groups')
          .select('id, name, description, visibility, owner_id')
          .or(
            `owner_id.eq.${user.id}${
              myGroupIds.length > 0
                ? ',id.in.(' + myGroupIds.join(',') + ')'
                : ''
            }`
          );

        if (myError) throw myError;
        setMyGroups((myGroupsData ?? []) as Group[]);

        // Gruppi esplorabili: public/closed dove non sei membro
        const { data: exploreData, error: eError } = await supabase
          .from('groups')
          .select('id, name, description, visibility, owner_id')
          .in('visibility', ['public', 'closed']);

        if (eError) throw eError;

        const memberGroupIds = new Set<number>(myGroupIds);

        // aggiungi anche i gruppi dove sei owner
        (myGroupsData ?? [])
          .filter(g => g.owner_id === user.id)
          .forEach(g => memberGroupIds.add(g.id));

        const filtered =
          exploreData?.filter(g => !memberGroupIds.has(g.id)) ?? [];

        setExploreGroups(filtered as Group[]);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message ?? 'Errore nel caricamento dei gruppi.');
      } finally {
        setLoadingGroups(false);
      }
    };

    if (user) {
      loadGroups();
    }
  }, [user]);

  const getMembershipForGroup = (groupId: number) =>
    memberships.find(m => m.group_id === groupId);

  const handleJoinGroup = async (group: Group) => {
    if (!user) return;
    setErrorMsg(null);

    try {
      const status = group.visibility === 'public' ? 'active' : 'pending';

      const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
        status,
      });

      if (error) throw error;

      // aggiorna localmente
      setMemberships(prev => [
        ...prev,
        {
          id: -Math.floor(Math.random() * 1000000),
          group_id: group.id,
          user_id: user.id,
          role: 'member',
          status: status as 'pending' | 'active',
        },
      ]);

      // aggiungi subito il gruppo ai "miei gruppi"
      setMyGroups(prev => [...prev, group]);

      setExploreGroups(prev => prev.filter(g => g.id !== group.id));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’unirsi al gruppo.');
    }
  };

  const handleLeaveGroup = async (groupId: number) => {
    if (!user) return;
    setErrorMsg(null);

    const membership = getMembershipForGroup(groupId);
    if (!membership) return;

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', membership.id);

      if (error) throw error;

      setMemberships(prev => prev.filter(m => m.id !== membership.id));
      setMyGroups(prev => prev.filter(g => g.id !== groupId));

      // se il gruppo era preferito, toglilo
      setFavoriteGroupIds(prev => {
        const next = prev.filter(id => id !== groupId);
        persistFavorites(next);
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nell’uscire dal gruppo.');
    }
  };

  const handleCreateGroup = async () => {
    if (!user) return;
    if (!newName.trim()) return;

    setCreating(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: newName.trim(),
          description: newDescription.trim() || null,
          visibility: newVisibility,
          owner_id: user.id,
        })
        .select('id, name, description, visibility, owner_id')
        .single();

      if (error) throw error;

      const group = data as Group;

      // l'owner viene aggiunto anche come membro admin attivo
      const { data: mData, error: mError } = await supabase
        .from('group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'admin',
          status: 'active',
        })
        .select('id, group_id, user_id, role, status')
        .single();

      if (mError) throw mError;

      setMyGroups(prev => [...prev, group]);
      setMemberships(prev => [...prev, mData as Membership]);
      setNewName('');
      setNewDescription('');
      setNewVisibility('public');
      setTab('my');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nella creazione del gruppo.');
    } finally {
      setCreating(false);
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

  // Liste filtrate / ordinate

  const mySearchNorm = mySearch.trim().toLowerCase();
  const visibleMyGroups = myGroups
    .filter(g => {
      if (!mySearchNorm) return true;
      const name = g.name.toLowerCase();
      const desc = (g.description ?? '').toLowerCase();
      return name.includes(mySearchNorm) || desc.includes(mySearchNorm);
    })
    .sort((a, b) => {
      const aFav = favoriteGroupIds.includes(a.id);
      const bFav = favoriteGroupIds.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });

  const exploreSearchNorm = exploreSearch.trim().toLowerCase();
  const visibleExploreGroups = exploreGroups.filter(g => {
    if (!exploreSearchNorm) return true;
    const name = g.name.toLowerCase();
    const desc = (g.description ?? '').toLowerCase();
    return name.includes(exploreSearchNorm) || desc.includes(exploreSearchNorm);
  });

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <AppHeader />

      <div className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setTab('my')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'my'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            I miei gruppi
          </button>
          <button
            onClick={() => setTab('explore')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'explore'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            Esplora
          </button>
          <button
            onClick={() => setTab('create')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === 'create'
                ? 'bg-slate-100 text-slate-900'
                : 'border-slate-600 text-slate-200'
            }`}
          >
            Crea gruppo
          </button>
        </div>

        {errorMsg && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        {/* Contenuto tab */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Colonna sinistra: contenuti tab */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 overflow-y-auto">
            {tab === 'my' && (
              <>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h2 className="text-sm font-semibold">
                    I miei gruppi ({myGroups.length})
                  </h2>
                  {myGroups.length > 0 && (
                    <input
                      type="text"
                      value={mySearch}
                      onChange={e => setMySearch(e.target.value)}
                      placeholder="Cerca tra i tuoi gruppi..."
                      className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px] focus:outline-none focus:ring focus:ring-slate-500"
                    />
                  )}
                </div>

                {loadingGroups ? (
                  <p className="text-xs text-slate-300">
                    Carico i tuoi gruppi...
                  </p>
                ) : visibleMyGroups.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {myGroups.length === 0
                      ? 'Non fai ancora parte di nessun gruppo. Creane uno o unisciti dalla scheda "Esplora".'
                      : 'Nessun gruppo corrisponde alla ricerca.'}
                  </p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {visibleMyGroups.map(group => {
                      const membership = getMembershipForGroup(group.id);
                      const isOwner = group.owner_id === user.id;
                      const isFavorite = favoriteGroupIds.includes(group.id);

                      return (
                        <div
                          key={group.id}
                          className="border border-slate-700 rounded-xl p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/groups/${group.id}`}
                                  className="font-semibold hover:underline"
                                >
                                  {group.name}
                                </Link>
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
                            </div>

                            {/* Stella preferito */}
                            <button
                              type="button"
                              onClick={() => toggleFavorite(group.id)}
                              className="p-1 rounded-full hover:bg-slate-900"
                              title={
                                isFavorite
                                  ? 'Rimuovi dai preferiti'
                                  : 'Aggiungi ai preferiti'
                              }
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill={isFavorite ? 'currentColor' : 'none'}
                                className={`w-5 h-5 ${
                                  isFavorite
                                    ? 'text-amber-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                <path
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11.48 3.499a.75.75 0 011.04 0l2.12 2.063a.75.75 0 00.564.219l2.94-.178a.75.75 0 01.79.79l-.178 2.94a.75.75 0 00.219.564l2.063 2.12a.75.75 0 010 1.04l-2.063 2.12a.75.75 0 00-.219.564l.178 2.94a.75.75 0 01-.79.79l-2.94-.178a.75.75 0 00-.564.219l-2.12 2.063a.75.75 0 01-1.04 0l-2.12-2.063a.75.75 0 00-.564-.219l-2.94.178a.75.75 0 01-.79-.79l.178-2.94a.75.75 0 00-.219-.564l-2.063-2.12a.75.75 0 010-1.04l2.063-2.12a.75.75 0 00.219-.564l-.178-2.94a.75.75 0 01.79-.79l2.94.178a.75.75 0 00.564-.219l2.12-2.063z"
                                />
                              </svg>
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {isOwner
                                ? 'Sei il proprietario'
                                : membership?.status === 'pending'
                                ? 'Richiesta in attesa'
                                : 'Membro del gruppo'}
                            </span>
                            {!isOwner && membership?.status === 'active' && (
                              <button
                                onClick={() =>
                                  handleLeaveGroup(group.id)
                                }
                                className="px-2 py-1 rounded-full border border-red-500 text-red-300 hover:bg-red-500/10"
                              >
                                Esci
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === 'explore' && (
              <>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h2 className="text-sm font-semibold">
                    Gruppi pubblici/chiusi
                  </h2>
                  {exploreGroups.length > 0 && (
                    <input
                      type="text"
                      value={exploreSearch}
                      onChange={e => setExploreSearch(e.target.value)}
                      placeholder="Cerca gruppi..."
                      className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px] focus:outline-none focus:ring focus:ring-slate-500"
                    />
                  )}
                </div>
                {loadingGroups ? (
                  <p className="text-xs text-slate-300">
                    Carico i gruppi...
                  </p>
                ) : visibleExploreGroups.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    {exploreGroups.length === 0
                      ? 'Nessun gruppo disponibile da esplorare al momento.'
                      : 'Nessun gruppo corrisponde alla ricerca.'}
                  </p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {visibleExploreGroups.map(group => (
                      <div
                        key={group.id}
                        className="border border-slate-700 rounded-xl p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/groups/${group.id}`}
                            className="font-semibold hover:underline"
                          >
                            {group.name}
                          </Link>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 text-slate-300">
                            {group.visibility === 'public'
                              ? 'Pubblico (join immediato)'
                              : 'Chiuso (richiede approvazione)'}
                          </span>
                        </div>
                        {group.description && (
                          <p className="text-xs text-slate-300">
                            {group.description}
                          </p>
                        )}
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleJoinGroup(group)}
                            className="px-3 py-1 rounded-full bg-amber-400 text-slate-900 text-xs font-semibold hover:bg-amber-300"
                          >
                            Unisciti al gruppo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === 'create' && (
              <>
                <h2 className="text-sm font-semibold mb-3">
                  Crea un nuovo gruppo
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">
                      Nome gruppo
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">
                      Descrizione (opzionale)
                    </label>
                    <textarea
                      value={newDescription}
                      onChange={e =>
                        setNewDescription(e.target.value)
                      }
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500 resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">
                      Visibilità
                    </label>
                    <select
                      value={newVisibility}
                      onChange={e =>
                        setNewVisibility(
                          e.target.value as
                            | 'public'
                            | 'closed'
                            | 'private'
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                    >
                      <option value="public">
                        Pubblico — visibile a tutti, join immediato
                      </option>
                      <option value="closed">
                        Chiuso — visibile a tutti, join su richiesta
                      </option>
                      <option value="private">
                        Privato — visibile solo a membri/invitati
                      </option>
                    </select>
                  </div>
                  <button
                    onClick={handleCreateGroup}
                    disabled={creating || !newName.trim()}
                    className="mt-2 w-full py-2.5 rounded-xl bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creo...' : 'Crea gruppo'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Colonna destra: help/testo */}
          <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 text-sm text-slate-300">
            <h2 className="text-sm font-semibold mb-2">
              Come funzionano i gruppi?
            </h2>
            <ul className="list-disc list-inside text-xs space-y-1 mb-3">
              <li>
                <span className="font-semibold">Pubblico</span>: tutti lo
                vedono, possono unirsi subito.
              </li>
              <li>
                <span className="font-semibold">Chiuso</span>: tutti lo
                vedono, ma la richiesta deve essere approvata dal
                proprietario/admin.
              </li>
              <li>
                <span className="font-semibold">Privato</span>: visibile
                solo a proprietario e membri.
              </li>
            </ul>
            <p className="text-xs text-slate-400">
              Entrando in un gruppo, comparirai nella classifica del gruppo
              (pagina di dettaglio), basata sulle pizze che hai mangiato
              nell&apos;anno.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Puoi contrassegnare i tuoi gruppi preferiti con la stellina ⭐:
              verranno mostrati sempre in cima alla lista.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function GroupsPage() {
  return (
    <ProtectedRoute>
      <GroupsPageContent />
    </ProtectedRoute>
  );
}
