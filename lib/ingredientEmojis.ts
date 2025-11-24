// Mapping centralizzato ingredienti → emoji
// Modificando questo file, le emoji si aggiorneranno in tutta l'app

export const INGREDIENT_EMOJI_MAP: Record<string, string> = {
  // classici
  'pomodoro': '🍅',
  'pomodori': '🍅',
  'mozzarella': '🧀',
  'cipolla': '🧅',
  'cipolle': '🧅',
  'salame': '🍖',
  'salame piccante': '🌶️',
  'salamino piccante': '🌶️',
  'salsiccia': '🥩',
  'wurstel': '🌭',
  'wurstel di pollo': '🌭',
  'prosciutto': '🥓',
  'prosciutto cotto': '🥓',
  'prosciutto crudo': '🥓',
  'speck': '🥓',

  // verdure
  'funghi': '🍄',
  'carciofi': '🫒',
  'carciofo': '🫒',
  'zucchine': '🥒',
  'zucchina': '🥒',
  'melanzane': '🍆',
  'melanzana': '🍆',
  'peperoni': '🫑',
  'peperone': '🫑',
  'rucola': '🥬',
  'insalata': '🥬',
  'basilico': '🌿',

  // mare
  'tonno': '🐟',
  'acciughe': '🐟',
  'acciuga': '🐟',
  'gamberi': '🦐',

  // extra
  'olive': '🫒',
  'olive nere': '🫒',
  'olive verdi': '🫒',
  'mais': '🌽',
  'ananas': '🍍',
  'gorgonzola': '🧀',
  'mozzarella di bufala': '🧀',
  'bufala': '🧀',

  // patate 😁
  'patatine fritte': '🍟',
  'patate fritte': '🍟',
  'patate': '🥔',
  'patate al forno': '🥔',
  'patate arrosto': '🥔',
  'patate lesse': '🥔',
};

/**
 * Restituisce l'emoji corrispondente a un ingrediente.
 * Se non trovato, restituisce l'emoji pizza di default.
 * @param name Nome dell'ingrediente
 * @returns Emoji corrispondente o 🍕
 */
export function getIngredientEmoji(name?: string | null): string {
  if (!name) return '🍕';
  
  // Normalizziamo: minuscolo + rimozione accenti
  let normalized = name.toLowerCase().trim();
  normalized = normalized
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, ''); // rimuove accenti

  return INGREDIENT_EMOJI_MAP[normalized] ?? '🍕';
}
