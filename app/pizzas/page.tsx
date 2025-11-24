'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PizzaDetailsPanel } from '@/components/PizzaDetailsPanel';
import { AppHeader } from '@/components/AppHeader';
import { getIngredientEmoji } from '@/lib/ingredientEmojis';


type User = {
    id: string;
    email?: string;
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

export default function PizzasPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loadingUser, setLoadingUser] = useState(true);

    const [year, setYear] = useState(CURRENT_YEAR);
    const [pizzas, setPizzas] = useState<PizzaListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [selectedPizzaId, setSelectedPizzaId] = useState<number | null>(null);

    const [deletingId, setDeletingId] = useState<number | null>(null);

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
                router.push('/auth');
                return;
            }

            setUser({ id: user.id, email: user.email ?? undefined });
            setLoadingUser(false);
        };

        loadUser();
    }, [router]);

    // Carica pizze dell'anno
    const loadPizzas = async (uid: string, yr: number) => {
        setLoading(true);
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
                .eq('user_id', uid)
                .gte('eaten_at', `${yr}-01-01`)
                .lte('eaten_at', `${yr}-12-31`)
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
                err.message ?? 'Errore nel caricamento della lista delle pizze.'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            loadPizzas(user.id, year);
        }
    }, [user, year]);

    const handleOpenDetails = (pizzaId: number) => {
        setSelectedPizzaId(pizzaId);
    };

    const handleCloseDetails = () => {
        setSelectedPizzaId(null);
    };

    const handleUpdatedPizza = () => {
        if (user) {
            loadPizzas(user.id, year);
        }
    };

    const handleDeletePizza = async (pizzaId: number) => {
        if (!user) return;
        const ok = window.confirm('Sei sicuro di voler eliminare questa pizza?');
        if (!ok) return;

        setErrorMsg(null);
        setDeletingId(pizzaId);

        try {
            // prima eliminiamo i collegamenti ingredienti (se non hai ON DELETE CASCADE)
            const { error: piError } = await supabase
                .from('pizza_ingredients')
                .delete()
                .eq('pizza_id', pizzaId);

            if (piError && piError.code !== 'PGRST116') {
                throw piError;
            }

            // poi eliminiamo la pizza
            const { error: pizzaError } = await supabase
                .from('pizzas')
                .delete()
                .eq('id', pizzaId)
                .eq('user_id', user.id); // ridondante ma sicuro

            if (pizzaError) throw pizzaError;

            // aggiorna lo stato locale
            setPizzas(prev => prev.filter(p => p.id !== pizzaId));
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message ?? 'Errore nell’eliminazione della pizza.');
        } finally {
            setDeletingId(null);
        }
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

            <div className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full">
                {/* Selettore anno */}
                <div className="flex items-center justify-center gap-3 mb-4">
                    <button
                        onClick={() => setYear(y => y - 1)}
                        className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
                    >
                        ◀
                    </button>
                    <span className="text-sm text-slate-300">
                        Pizze del <span className="font-semibold text-slate-50">{year}</span>
                    </span>
                    <button
                        onClick={() => setYear(y => y + 1)}
                        className="px-3 py-1 rounded-full border border-slate-700 text-sm hover:bg-slate-800"
                    >
                        ▶
                    </button>
                </div>

                {errorMsg && (
                    <p className="mb-3 text-sm text-red-400 text-center">{errorMsg}</p>
                )}

                {loading ? (
                    <p className="text-sm text-slate-300 text-center">
                        Carico le pizze...
                    </p>
                ) : pizzas.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center">
                        Nessuna pizza registrata per il {year}. Usa il bottone +1 dalla
                        home per iniziare!
                    </p>
                ) : (
                    <div className="space-y-3">
                        {pizzas.map(pizza => (
                            <button
                                key={pizza.id}
                                type="button"
                                onClick={() => handleOpenDetails(pizza.id)}
                                className="w-full text-left bg-slate-800/70 border border-slate-700 rounded-2xl overflow-hidden hover:border-slate-500 transition flex"
                            >
                                {pizza.photo_url && (
                                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-800 p-1">
                                    <img
                                    src={pizza.photo_url}
                                    alt="Foto pizza"
                                    className="w-full h-full object-cover rounded-lg"
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
                                        {pizza.has_details && ' • dettagli completati'}
                                    </p>
                                    {pizza.ingredients.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-1">
                                            {pizza.ingredients.map(ing => (
                                                <Link
                                                    key={ing.id}
                                                    href={`/stats/ingredients/${ing.id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="px-2 py-0.5 rounded-full text-[10px] bg-slate-900 border border-slate-600 text-slate-100 hover:bg-slate-800 hover:border-amber-500 transition flex items-center gap-1"
                                                >
                                                    <span>{getIngredientEmoji(ing.name)}</span>
                                                    <span>{ing.name}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                    {pizza.notes && (
                                        <p className="text-xs text-slate-300 line-clamp-2">
                                            {pizza.notes}
                                        </p>
                                    )}
                                    <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleDeletePizza(pizza.id);
                                    }}
                                    disabled={deletingId === pizza.id}
                                    className="text-[11px] px-3 py-1 rounded-full border border-red-500/70 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                    {deletingId === pizza.id ? 'Elimino...' : 'Elimina'}
                                </button>
                                </div>
                            </button>
                            
                        ))}
                    </div>
                )}
            </div>

            {selectedPizzaId !== null && (
                <PizzaDetailsPanel
                    pizzaId={selectedPizzaId}
                    userId={user.id}
                    onClose={handleCloseDetails}
                    onUpdated={handleUpdatedPizza}
                />
            )}
        </main>
    );
}
