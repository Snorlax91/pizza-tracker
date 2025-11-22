'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Ingredient = {
  id: number;
  name: string;
};

type PizzaDetailsPanelProps = {
  pizzaId: number;
  userId: string;
  onClose: () => void;
  onUpdated?: () => void;
};

// Lista molto semplice di parole vietate (italiano + un po' di inglese)
// Non è perfetta, ma filtra le cose più grosse.
const BANNED_WORDS = [
  'cazzo',
  'cazzi',
  'merda',
  'stronzo',
  'stronzi',
  'vaffanculo',
  'puttana',
  'puttane',
  'troia',
  'troie',
  'dio cane',
  'dio porco',
  'dio merda',
  'porco dio',
  'porcodio',
  'gesù',
  'cristo',
  'madonna',
  'fuck',
  'shit',
  'bitch',
  'asshole',
];

type PizzaOrigin =
  | ''
  | 'takeaway'
  | 'frozen'
  | 'restaurant'
  | 'bakery'
  | 'bar'
  | 'other';


function containsBadWords(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(word => lower.includes(word));
}

export function PizzaDetailsPanel({
  pizzaId,
  userId,
  onClose,
  onUpdated,
}: PizzaDetailsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('Pizza');
  const [date, setDate] = useState<string>('');
  const [rating, setRating] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientResults, setIngredientResults] = useState<Ingredient[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<Ingredient[]>(
    []
  );
  const [searchingIngredients, setSearchingIngredients] = useState(false);

  const [userSuggestions, setUserSuggestions] = useState<Ingredient[]>([]);
  const [globalSuggestions, setGlobalSuggestions] = useState<Ingredient[]>(
    []
  );
  const [origin, setOrigin] = useState<PizzaOrigin>('');


  // Carica dettagli pizza + ingredienti selezionati + suggerimenti
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        // Dettagli pizza
        const { data: pizza, error: pizzaError } = await supabase
        .from('pizzas')
        .select('name, eaten_at, rating, notes, photo_url, origin')
        .eq('id', pizzaId)
        .maybeSingle();


        if (pizzaError) throw pizzaError;
        if (!pizza) throw new Error('Pizza non trovata');

        setName(pizza.name ?? 'Pizza');
        setDate(pizza.eaten_at ?? '');
        setRating(pizza.rating ?? '');
        setNotes(pizza.notes ?? '');
        setPhotoUrl(pizza.photo_url ?? null);
        setOrigin((pizza.origin as PizzaOrigin) ?? '');

        // Ingredienti già collegati alla pizza
        const { data: pizzaIngr, error: ingrError } = await supabase
          .from('pizza_ingredients')
          .select('ingredient_id, ingredients ( id, name )')
          .eq('pizza_id', pizzaId);

        if (ingrError) throw ingrError;

        const selected: Ingredient[] =
          pizzaIngr
            ?.map((row: any) => row.ingredients)
            .filter((i: any) => i) ?? [];

        setSelectedIngredients(selected);

        // SUGGERIMENTI: ingredienti più usati dall'utente
        try {
          const { data: piData, error: piError } = await supabase
            .from('pizza_ingredients')
            .select(
              `
              ingredient_id,
              ingredients ( id, name ),
              pizzas!inner ( user_id )
            `
            )
            .eq('pizzas.user_id', userId)
            .limit(200);

          if (!piError && piData) {
            const freq: Record<number, { ing: Ingredient; count: number }> =
              {};
            (piData as any[]).forEach(row => {
              const ing = row.ingredients;
              if (!ing) return;
              const id = ing.id as number;
              if (!freq[id]) {
                freq[id] = { ing: { id, name: ing.name }, count: 0 };
              }
              freq[id].count += 1;
            });

            const sorted = Object.values(freq)
              .sort((a, b) => b.count - a.count)
              .map(x => x.ing);

            setUserSuggestions(sorted.slice(0, 6));
          }
        } catch (e) {
          console.warn('Impossibile caricare suggerimenti utente', e);
        }

        // SUGGERIMENTI GLOBALI: ingredienti creati più di recente
        try {
          const { data: globalData, error: globalError } = await supabase
            .from('ingredients')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(12);

          if (!globalError && globalData) {
            setGlobalSuggestions(globalData as Ingredient[]);
          }
        } catch (e) {
          console.warn('Impossibile caricare suggerimenti globali', e);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nel caricamento dei dettagli della pizza.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [pizzaId, userId]);

  // Ricerca ingredienti mentre scrivi
  useEffect(() => {
    const runSearch = async () => {
      const term = ingredientSearch.trim();
      if (!term) {
        setIngredientResults([]);
        return;
      }

      setSearchingIngredients(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase
          .from('ingredients')
          .select('id, name')
          .ilike('name', `%${term}%`)
          .order('name')
          .limit(10);

        if (error) throw error;
        setIngredientResults(data ?? []);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nella ricerca degli ingredienti.'
        );
      } finally {
        setSearchingIngredients(false);
      }
    };

    const t = setTimeout(runSearch, 300); // piccolo debounce
    return () => clearTimeout(t);
  }, [ingredientSearch]);

  const handleToggleIngredient = async (ingredient: Ingredient) => {
    const alreadySelected = selectedIngredients.some(
      i => i.id === ingredient.id
    );

    if (alreadySelected) {
      // rimuovi collegamento
      try {
        const { error } = await supabase
          .from('pizza_ingredients')
          .delete()
          .eq('pizza_id', pizzaId)
          .eq('ingredient_id', ingredient.id);

        if (error) throw error;

        setSelectedIngredients(prev =>
          prev.filter(i => i.id !== ingredient.id)
        );
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nella rimozione dell’ingrediente.'
        );
      }
    } else {
      // aggiungi collegamento
      try {
        const { error } = await supabase.from('pizza_ingredients').insert({
          pizza_id: pizzaId,
          ingredient_id: ingredient.id,
        });

        if (error) throw error;

        setSelectedIngredients(prev => [...prev, ingredient]);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(
          err.message ?? 'Errore nell’aggiunta dell’ingrediente.'
        );
      }
    }
  };

  const handleCreateIngredient = async () => {
    const name = ingredientSearch.trim();
    if (!name) return;

    // controllo parolacce / bestemmie
    if (containsBadWords(name)) {
      setErrorMsg(
        'Il nome dell’ingrediente contiene parole non permesse. Scegli un nome diverso.'
      );
      return;
    }

    try {
      // esiste già un ingrediente con lo stesso nome?
      const { data: existing, error: searchError } = await supabase
        .from('ingredients')
        .select('id, name')
        .ilike('name', name)
        .maybeSingle();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      if (existing) {
        await handleToggleIngredient(existing as Ingredient);
        setIngredientSearch('');
        return;
      }

      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          name,
          created_by: userId,
        })
        .select('id, name')
        .single();

      if (error) throw error;

      await handleToggleIngredient(data as Ingredient);
      setIngredientSearch('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.message ?? 'Errore nella creazione dell’ingrediente.'
      );
    }
  };

  // Invio da tastiera (anche mobile) per aggiungere l'ingrediente
  const handleIngredientKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateIngredient();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);

    try {
      const ext = file.name.split('.').pop();
      const filePath = `${userId}/${pizzaId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('pizza-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('pizza-photos').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('pizzas')
        .update({ photo_url: publicUrl })
        .eq('id', pizzaId);

      if (updateError) throw updateError;

      setPhotoUrl(publicUrl);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nel caricamento della foto.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase
        .from('pizzas')
        .update({
          name,
          eaten_at: date || null,
          rating: rating === '' ? null : rating,
          origin: origin === '' ? null : origin,
          notes,
          has_details: true,
        })
        .eq('id', pizzaId);

      if (error) throw error;

      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message ?? 'Errore nel salvataggio della pizza.');
    } finally {
      setSaving(false);
    }
  };

  // Filtra suggerimenti escludendo quelli già selezionati (solo estetica)
  const selectedIds = new Set(selectedIngredients.map(i => i.id));
  const filteredUserSuggestions = userSuggestions.filter(
    ing => !selectedIds.has(ing.id)
  );
  const filteredGlobalSuggestions = globalSuggestions.filter(
    ing => !selectedIds.has(ing.id)
  );

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 px-2">
      <div className="bg-slate-900 w-full max-w-md sm:max-w-lg rounded-t-2xl sm:rounded-2xl sm:shadow-xl border-t sm:border border-slate-800 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">
            Dettagli pizza
          </h2>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Salta per ora ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-300">Caricamento...</p>
          ) : (
            <>
              {errorMsg && (
                <p className="text-sm text-red-400">{errorMsg}</p>
              )}

              {/* Foto */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300">
                  Foto (opzionale)
                </label>
                {photoUrl && (
                  <img
                    src={photoUrl}
                    alt="Foto pizza"
                    className="w-full h-40 object-cover rounded-xl border border-slate-700"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="text-xs text-slate-300"
                />
              </div>

              {/* Nome */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300">
                  Nome pizza
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                />
              </div>

              {/* Data */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300">Data</label>
                <input
                  type="date"
                  value={date ?? ''}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                />
              </div>

              {/* Rating */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300">
                  Voto (0–10, opzionale)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={rating}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '') {
                      setRating('');
                    } else {
                      const n = parseInt(v, 10);
                      setRating(Number.isNaN(n) ? '' : n);
                    }
                  }}
                  className="w-24 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                />
              </div>

              {/* Provenienza della pizza */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300">
                  Provenienza (opzionale)
                </label>
                <select
                  value={origin}
                  onChange={e => setOrigin(e.target.value as PizzaOrigin)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                >
                  <option value="">— Non specificato —</option>
                  <option value="takeaway">Da asporto</option>
                  <option value="frozen">Surgelata</option>
                  <option value="restaurant">Ristorante</option>
                  <option value="bakery">Panificio</option>
                  <option value="bar">Bar</option>
                  <option value="other">Altro</option>
                </select>
              </div>


              {/* Ingredienti */}
              <div className="space-y-2">
                <label className="text-xs text-slate-300">
                  Ingredienti
                </label>
                <input
                  type="text"
                  placeholder="Cerca o scrivi un ingrediente e premi Invio..."
                  value={ingredientSearch}
                  onChange={e => setIngredientSearch(e.target.value)}
                  onKeyDown={handleIngredientKeyDown}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500"
                />
                {ingredientSearch.trim() && (
                  <button
                    type="button"
                    onClick={handleCreateIngredient}
                    className="mt-1 text-[11px] text-amber-300 hover:text-amber-200"
                  >
                    Aggiungi &quot;{ingredientSearch.trim()}&quot; come
                    ingrediente per questa pizza
                  </button>
                )}

                {searchingIngredients ? (
                  <p className="text-xs text-slate-400">
                    Cerco ingredienti...
                  </p>
                ) : ingredientResults.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ingredientResults.map(ing => {
                      const selected = selectedIngredients.some(
                        i => i.id === ing.id
                      );
                      return (
                        <button
                          key={ing.id}
                          type="button"
                          onClick={() => handleToggleIngredient(ing)}
                          className={`px-3 py-1 rounded-full text-xs border ${
                            selected
                              ? 'bg-amber-400 text-slate-900 border-amber-300'
                              : 'bg-slate-900 text-slate-100 border-slate-600'
                          }`}
                        >
                          {ing.name}
                        </button>
                      );
                    })}
                  </div>
                ) : ingredientSearch.trim() ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Nessun ingrediente trovato.
                  </p>
                ) : null}

                {/* SUGGERIMENTI */}
                {(filteredUserSuggestions.length > 0 ||
                  filteredGlobalSuggestions.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {filteredUserSuggestions.length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-400 mb-1">
                          Suggeriti per te (i tuoi ingredienti più usati)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {filteredUserSuggestions.map(ing => (
                            <button
                              key={ing.id}
                              type="button"
                              onClick={() => handleToggleIngredient(ing)}
                              className="px-3 py-1 rounded-full text-xs border border-amber-400/60 bg-amber-500/10 text-amber-200"
                            >
                              {ing.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredGlobalSuggestions.length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-400 mb-1">
                          Ingredienti popolari (suggerimenti generali)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {filteredGlobalSuggestions.map(ing => (
                            <button
                              key={ing.id}
                              type="button"
                              onClick={() => handleToggleIngredient(ing)}
                              className="px-3 py-1 rounded-full text-xs border border-slate-600 bg-slate-900 text-slate-100"
                            >
                              {ing.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Ingredienti selezionati */}
                {selectedIngredients.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] text-slate-400 mb-1">
                      Ingredienti di questa pizza (tocca per rimuovere):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIngredients.map(ing => (
                        <button
                          key={ing.id}
                          type="button"
                          onClick={() => handleToggleIngredient(ing)}
                          className="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-200 border border-amber-400/60 flex items-center gap-1"
                        >
                          <span>{ing.name}</span>
                          <span className="text-[9px] opacity-80">
                            ✕
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="text-xs text-slate-300">
                  Note (opzionali)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:outline-none focus:ring focus:ring-slate-500 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800">
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            Salta per ora
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-xl text-sm bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvataggio...' : 'Salva dettagli'}
          </button>
        </div>
      </div>
    </div>
  );
}
