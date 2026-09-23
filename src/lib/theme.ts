/**
 * Sistema de tema de marca blanca (modo claro y oscuro).
 *
 * El administrador elige el color principal, el acento y (en modo claro) el
 * fondo. Todo lo demás se deriva y se valida con ratios de contraste WCAG:
 *   - primary   → texto/acentos principales (claro: oscuro; oscuro: claro)
 *   - button    → fondo de botones principales (+ onButton para su texto)
 *   - surface   → superficies oscuras (barra lateral, encabezados)
 *   - dark      → texto de títulos y texto fuerte
 *   - background / card / card2 / pill → fondos y tarjetas
 *   - muted     → texto secundario
 *
 * Los colores se publican como variables CSS (--brand-*) en tripletas HSL.
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeInput {
  primary: string;
  accent: string;
  background: string;
  dark?: string;
  card?: string;
  muted?: string;
  wine?: string;
  fontHeading?: string;
  fontBody?: string;
  fontScript?: string;
  mode?: ThemeMode;
}

export interface ResolvedTheme {
  mode: ThemeMode;
  primary: string;
  primaryStrong: string;
  button: string;
  onButton: string;
  surface: string;
  dark: string;
  accent: string;
  background: string;
  card: string;
  card2: string;
  pill: string;
  muted: string;
  wine: string;
  onPrimary: string;
  onDark: string;
  onAccent: string;
  fontHeading: string;
  fontBody: string;
  fontScript: string;
}

export interface CustomFont {
  family: string;
  url: string;
}

export interface ContrastCheck {
  label: string;
  fg: string;
  bg: string;
  min: number;
  ratio: number;
  ok: boolean;
}

export const DEFAULT_THEME: Required<ThemeInput> = {
  primary: '#364266',
  accent: '#C6BF81',
  background: '#FEF3DE',
  dark: '#242D49',
  card: '#FAF8EA',
  muted: '#897863',
  wine: '#CC3366',
  fontHeading: 'Playfair Display',
  fontBody: 'Lapture',
  fontScript: 'Great Vibes',
  mode: 'light',
};

/** Base sin ajustes manuales (tarjetas, barra, texto secundario se derivan). Úsese para mezclar con el tema guardado. */
export const BASE_THEME: ThemeInput = {
  primary: DEFAULT_THEME.primary,
  accent: DEFAULT_THEME.accent,
  background: DEFAULT_THEME.background,
  fontHeading: DEFAULT_THEME.fontHeading,
  fontBody: DEFAULT_THEME.fontBody,
  fontScript: DEFAULT_THEME.fontScript,
  mode: 'light',
};

/* ------------------------------------------------------------------ */
/* Matemática de color                                                  */
/* ------------------------------------------------------------------ */

type RGB = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

export function normalizeHex(hex: string, fallback = '#000000'): string {
  if (!hex) return fallback;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return '#' + h.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const H = ((h % 360) + 360) % 360 / 360, S = s / 100, L = l / 100;
  if (S === 0) { const v = L * 255; return { r: v, g: v, b: v }; }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const hue = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(H + 1 / 3) * 255, g: hue(H) * 255, b: hue(H - 1 / 3) * 255 };
}

export function hexToHsl(hex: string): HSL { return rgbToHsl(hexToRgb(hex)); }
export function hslToHex(hsl: HSL): string { return rgbToHex(hslToRgb(hsl)); }

/** "224 31% 31%" — formato que consumen las variables CSS de Tailwind. */
export function hexToHslTriplet(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export function hslTripletToHex(triplet: string, fallback = '#000000'): string {
  const m = triplet.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return fallback;
  return hslToHex({ h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) });
}

export function adjustLightness(hex: string, delta: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(100, hsl.l + delta)) });
}

export function withLightness(hex: string, l: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(100, l)) });
}

export function adjustSaturation(hex: string, delta: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, s: Math.max(0, Math.min(100, hsl.s + delta)) });
}

/** Mezcla a hacia b (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.5;
}

function bestTextOn(bg: string, candidates: string[], min = 4.5): string {
  for (const c of candidates) if (contrastRatio(c, bg) >= min) return c;
  return candidates.reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best), candidates[0]);
}

/** Aclara u oscurece hasta alcanzar el contraste mínimo contra bg. */
function ensureContrast(hex: string, bg: string, min: number, direction: 1 | -1, limit = 30): string {
  let out = hex;
  for (let i = 0; i < limit && contrastRatio(out, bg) < min; i++) out = adjustLightness(out, 2 * direction);
  return out;
}

/* ------------------------------------------------------------------ */
/* Derivación y validación                                              */
/* ------------------------------------------------------------------ */

/**
 * Restricciones del modelo: el color principal se guarda siempre oscuro
 * (luminosidad ≤ 42%) y, en modo claro, el fondo siempre claro (≥ 84%). En modo
 * oscuro los fondos se derivan del tono del color principal.
 */
export function constrainInput(input: ThemeInput): ThemeInput {
  const out: ThemeInput = { ...input };
  out.primary = normalizeHex(input.primary, DEFAULT_THEME.primary);
  out.accent = normalizeHex(input.accent, DEFAULT_THEME.accent);
  out.background = normalizeHex(input.background, DEFAULT_THEME.background);
  out.mode = input.mode === 'dark' ? 'dark' : 'light';

  const bgL = hexToHsl(out.background).l;
  if (bgL < 84) out.background = withLightness(out.background, 92);
  const pL = hexToHsl(out.primary).l;
  if (pL > 42) out.primary = withLightness(out.primary, 32);

  if (out.dark) out.dark = normalizeHex(out.dark, '');
  if (out.card) out.card = normalizeHex(out.card, '');
  if (out.muted) out.muted = normalizeHex(out.muted, '');
  if (out.wine) out.wine = normalizeHex(out.wine, '');
  return out;
}

function resolveLight(input: ThemeInput): Omit<ResolvedTheme, 'fontHeading' | 'fontBody' | 'fontScript'> {
  const primary = input.primary;
  const accent = input.accent;
  const background = input.background;
  const primaryStrong = adjustLightness(primary, -2);
  const surface = input.dark || adjustLightness(primary, -10);
  const dark = surface;
  const card = input.card || mix(background, '#FFFFFF', 0.45);
  const card2 = mix(card, accent, 0.18);
  const pill = mix(background, accent, 0.3);
  let muted = input.muted || adjustSaturation(mix(primary, background, 0.5), -20);
  muted = ensureContrast(muted, background, 3.5, -1);
  const wine = input.wine || DEFAULT_THEME.wine;
  const onButton = bestTextOn(primaryStrong, [background, '#FFFFFF', '#1A1A1A']);
  const onDark = bestTextOn(surface, [background, '#FFFFFF', '#1A1A1A']);
  const onAccent = bestTextOn(accent, [dark, primary, '#1A1A1A', '#FFFFFF']);
  return { mode: 'light', primary, primaryStrong, button: primaryStrong, onButton, surface, dark, accent, background, card, card2, pill, muted, wine, onPrimary: onButton, onDark, onAccent };
}

function resolveDark(input: ThemeInput): Omit<ResolvedTheme, 'fontHeading' | 'fontBody' | 'fontScript'> {
  const base = hexToHsl(input.primary);
  const h = base.h;
  const s = Math.max(8, Math.min(40, base.s));
  const background = hslToHex({ h, s: s * 0.6, l: 9 });
  const surface = input.dark || hslToHex({ h, s: s * 0.7, l: 6 });
  const card = input.card || hslToHex({ h, s: s * 0.55, l: 13 });
  const card2 = hslToHex({ h, s: s * 0.5, l: 18 });
  const pill = hslToHex({ h, s: s * 0.5, l: 23 });
  const dark = hslToHex({ h, s: 15, l: 94 });
  const primary = ensureContrast(withLightness(input.primary, 78), background, 4.5, 1);
  let button = withLightness(input.primary, 52);
  const onButton = bestTextOn(button, ['#FFFFFF', '#111111', background]);
  if (contrastRatio(onButton, button) < 4.5) button = withLightness(input.primary, 45);
  let accent = input.accent;
  accent = ensureContrast(accent, background, 3, 1);
  const onAccent = bestTextOn(accent, ['#111111', '#FFFFFF']);
  let muted = input.muted || hslToHex({ h, s: 10, l: 64 });
  muted = ensureContrast(muted, background, 3.5, 1);
  const wineBase = input.wine || DEFAULT_THEME.wine;
  const wine = ensureContrast(wineBase, background, 3, 1);
  const onDark = hslToHex({ h, s: 15, l: 92 });
  return { mode: 'dark', primary, primaryStrong: button, button, onButton, surface, dark, accent, background, card, card2, pill, muted, wine, onPrimary: onButton, onDark, onAccent };
}

export function resolveTheme(raw: ThemeInput | null | undefined): ResolvedTheme {
  const input = constrainInput({ ...DEFAULT_THEME, ...(raw || {}), dark: raw?.dark, card: raw?.card, muted: raw?.muted, wine: raw?.wine });
  const colors = input.mode === 'dark' ? resolveDark(input) : resolveLight(input);
  return {
    ...colors,
    fontHeading: input.fontHeading || DEFAULT_THEME.fontHeading,
    fontBody: input.fontBody || DEFAULT_THEME.fontBody,
    fontScript: input.fontScript || DEFAULT_THEME.fontScript,
  };
}

export function contrastChecks(t: ResolvedTheme): ContrastCheck[] {
  const mk = (label: string, fg: string, bg: string, min: number): ContrastCheck => {
    const ratio = contrastRatio(fg, bg);
    return { label, fg, bg, min, ratio, ok: ratio >= min };
  };
  return [
    mk('Texto principal sobre el fondo', t.primary, t.background, 4.5),
    mk('Títulos sobre tarjetas', t.dark, t.card, 4.5),
    mk('Texto sobre botones principales', t.onButton, t.button, 4.5),
    mk('Texto sobre la barra lateral', t.onDark, t.surface, 4.5),
    mk('Texto secundario sobre el fondo', t.muted, t.background, 3.5),
    mk('Acento sobre la barra lateral (íconos activos)', t.accent, t.surface, 3),
    mk('Acento sobre el fondo (detalles)', t.accent, t.background, 1.6),
  ];
}

/** Ajusta automáticamente los colores hasta que todas las verificaciones pasen. */
export function autoFixTheme(raw: ThemeInput): ThemeInput {
  const input = constrainInput({ ...raw });
  for (let i = 0; i < 30; i++) {
    const t = resolveTheme(input);
    const checks = contrastChecks(t);
    if (checks.every(c => c.ok)) break;
    const failing = checks.filter(c => !c.ok).map(c => c.label);
    if (input.mode === 'dark') {
      if (failing.some(l => l.startsWith('Acento'))) input.accent = adjustLightness(input.accent, 4);
      if (failing.some(l => l.startsWith('Texto secundario')) && input.muted) input.muted = adjustLightness(input.muted, 4);
      if (failing.some(l => l.startsWith('Títulos')) && input.card) input.card = adjustLightness(input.card, -4);
      if (failing.some(l => l.startsWith('Texto sobre la barra')) && input.dark) input.dark = adjustLightness(input.dark, -4);
      continue;
    }
    if (failing.some(l => l.startsWith('Texto principal') || l.startsWith('Títulos') || l.startsWith('Texto sobre botones'))) {
      input.primary = adjustLightness(input.primary, -3);
      if (hexToHsl(input.primary).l <= 12) input.background = adjustLightness(input.background, 2);
    }
    if (failing.some(l => l.startsWith('Acento sobre la barra'))) input.accent = adjustLightness(input.accent, 4);
    if (failing.some(l => l.startsWith('Acento sobre el fondo'))) input.accent = adjustLightness(input.accent, -4);
    if (failing.some(l => l.startsWith('Texto secundario')) && input.muted) input.muted = adjustLightness(input.muted, -4);
    if (failing.some(l => l.startsWith('Texto sobre la barra')) && input.dark) input.dark = adjustLightness(input.dark, -5);
  }
  return input;
}

/* ------------------------------------------------------------------ */
/* Presets                                                              */
/* ------------------------------------------------------------------ */

export const THEME_PRESETS: Array<{ name: string; description: string; theme: ThemeInput }> = [
  { name: 'Clásico', description: 'Azul marino, dorado y crema', theme: { primary: '#364266', accent: '#C6BF81', background: '#FEF3DE', mode: 'light' } },
  { name: 'Tropical', description: 'Coral, mango y crema', theme: { primary: '#B8412E', accent: '#F5B942', background: '#FFF6EA', mode: 'light' } },
  { name: 'Pistacho', description: 'Verde profundo y menta', theme: { primary: '#2F5D45', accent: '#9CCB86', background: '#F4F9F1', mode: 'light' } },
  { name: 'Chocolate', description: 'Cacao, caramelo y vainilla', theme: { primary: '#4A2810', accent: '#D9A05B', background: '#FBF5EC', mode: 'light' } },
  { name: 'Fresa', description: 'Frambuesa, rosa y nata', theme: { primary: '#8E2450', accent: '#F4A6B8', background: '#FFF4F7', mode: 'light' } },
  { name: 'Menta', description: 'Verde azulado y turquesa', theme: { primary: '#11605B', accent: '#7FD1C3', background: '#F1FAF8', mode: 'light' } },
  { name: 'Océano', description: 'Azul intenso y cielo', theme: { primary: '#1E3A8A', accent: '#7DD3FC', background: '#F3F7FF', mode: 'light' } },
  { name: 'Carbón', description: 'Gris grafito y dorado', theme: { primary: '#2B2B2E', accent: '#E0B15C', background: '#F7F5F0', mode: 'light' } },
  { name: 'Noche', description: 'Modo oscuro azul marino y dorado', theme: { primary: '#364266', accent: '#E3C46A', background: '#FEF3DE', mode: 'dark' } },
  { name: 'Bosque oscuro', description: 'Modo oscuro verde y lima', theme: { primary: '#2F5D45', accent: '#A8E08C', background: '#F4F9F1', mode: 'dark' } },
  { name: 'Grafito', description: 'Modo oscuro neutro y ámbar', theme: { primary: '#2B2B2E', accent: '#F0B35B', background: '#F7F5F0', mode: 'dark' } },
  { name: 'Berenjena', description: 'Modo oscuro morado y rosa', theme: { primary: '#4C2A6B', accent: '#F4A6B8', background: '#FFF4F7', mode: 'dark' } },
];

/* ------------------------------------------------------------------ */
/* Fuentes                                                              */
/* ------------------------------------------------------------------ */

export interface FontOption {
  family: string;
  source: 'bundled' | 'google' | 'custom';
  category: 'serif' | 'sans' | 'display' | 'script';
}

export const FONT_CATALOG: FontOption[] = [
  { family: 'Lapture', source: 'bundled', category: 'serif' },
  { family: 'Lapture Display', source: 'bundled', category: 'serif' },
  { family: 'Playfair Display', source: 'google', category: 'serif' },
  { family: 'Fraunces', source: 'google', category: 'serif' },
  { family: 'Lora', source: 'google', category: 'serif' },
  { family: 'Merriweather', source: 'google', category: 'serif' },
  { family: 'Cormorant Garamond', source: 'google', category: 'serif' },
  { family: 'Libre Baskerville', source: 'google', category: 'serif' },
  { family: 'Source Serif 4', source: 'google', category: 'serif' },
  { family: 'IBM Plex Serif', source: 'google', category: 'serif' },
  { family: 'Bitter', source: 'google', category: 'serif' },
  { family: 'DM Serif Display', source: 'google', category: 'display' },
  { family: 'Fredoka', source: 'google', category: 'display' },
  { family: 'Baloo 2', source: 'google', category: 'display' },
  { family: 'Comfortaa', source: 'google', category: 'display' },
  { family: 'Cinzel', source: 'google', category: 'display' },
  { family: 'Plus Jakarta Sans', source: 'google', category: 'sans' },
  { family: 'Inter', source: 'google', category: 'sans' },
  { family: 'Poppins', source: 'google', category: 'sans' },
  { family: 'Montserrat', source: 'google', category: 'sans' },
  { family: 'Nunito', source: 'google', category: 'sans' },
  { family: 'Nunito Sans', source: 'google', category: 'sans' },
  { family: 'Quicksand', source: 'google', category: 'sans' },
  { family: 'Raleway', source: 'google', category: 'sans' },
  { family: 'Lato', source: 'google', category: 'sans' },
  { family: 'Open Sans', source: 'google', category: 'sans' },
  { family: 'Source Sans 3', source: 'google', category: 'sans' },
  { family: 'IBM Plex Sans', source: 'google', category: 'sans' },
  { family: 'DM Sans', source: 'google', category: 'sans' },
  { family: 'Manrope', source: 'google', category: 'sans' },
  { family: 'Outfit', source: 'google', category: 'sans' },
  { family: 'Josefin Sans', source: 'google', category: 'sans' },
  { family: 'Great Vibes', source: 'google', category: 'script' },
  { family: 'Pacifico', source: 'google', category: 'script' },
  { family: 'Dancing Script', source: 'google', category: 'script' },
  { family: 'Lobster', source: 'google', category: 'script' },
  { family: 'Satisfy', source: 'google', category: 'script' },
  { family: 'Caveat', source: 'google', category: 'script' },
  { family: 'Sacramento', source: 'google', category: 'script' },
  { family: 'Yellowtail', source: 'google', category: 'script' },
];

export const FONT_CATEGORY_LABEL: Record<FontOption['category'], string> = {
  serif: 'Serif (elegantes)',
  sans: 'Sans (modernas)',
  display: 'Display (llamativas)',
  script: 'Script (manuscritas)',
};

/** Combinaciones recomendadas: títulos + texto + decorativa. */
export interface FontPairing {
  name: string;
  description: string;
  heading: string;
  body: string;
  script: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  { name: 'Artesanal', description: 'Playfair Display + Lapture — la combinación original de heladería.', heading: 'Playfair Display', body: 'Lapture', script: 'Great Vibes' },
  { name: 'Editorial', description: 'Fraunces + Inter — estilo revista, cálida y legible.', heading: 'Fraunces', body: 'Inter', script: 'Caveat' },
  { name: 'Clásica', description: 'Lora + Source Sans 3 — más libro, menos magazine.', heading: 'Lora', body: 'Source Sans 3', script: 'Sacramento' },
  { name: 'Elegante', description: 'Cormorant Garamond + Montserrat — boutique y refinada.', heading: 'Cormorant Garamond', body: 'Montserrat', script: 'Great Vibes' },
  { name: 'Moderna', description: 'DM Serif Display + DM Sans — contraste limpio y actual.', heading: 'DM Serif Display', body: 'DM Sans', script: 'Dancing Script' },
  { name: 'Limpia', description: 'IBM Plex Serif + IBM Plex Sans — sobria, técnica.', heading: 'IBM Plex Serif', body: 'IBM Plex Sans', script: 'Caveat' },
  { name: 'Humanista', description: 'Bitter + Nunito Sans — cálida, accesible.', heading: 'Bitter', body: 'Nunito Sans', script: 'Satisfy' },
  { name: 'Geométrica', description: 'Manrope para todo — minimalista y nítida.', heading: 'Manrope', body: 'Manrope', script: 'Pacifico' },
  { name: 'Amigable', description: 'Fredoka + Nunito — redondeada y cercana, ideal para familias.', heading: 'Fredoka', body: 'Nunito', script: 'Pacifico' },
  { name: 'Divertida', description: 'Baloo 2 + Quicksand — juguetona, para marcas jóvenes.', heading: 'Baloo 2', body: 'Quicksand', script: 'Yellowtail' },
  { name: 'Premium', description: 'Cinzel + Josefin Sans — mayúsculas romanas y aire de lujo.', heading: 'Cinzel', body: 'Josefin Sans', script: 'Sacramento' },
  { name: 'Corporativa', description: 'Poppins + Open Sans — segura y universal.', heading: 'Poppins', body: 'Open Sans', script: 'Dancing Script' },
];

const GENERIC_FALLBACK: Record<FontOption['category'], string> = {
  serif: 'Georgia, serif',
  sans: 'system-ui, sans-serif',
  display: 'system-ui, sans-serif',
  script: 'cursive',
};

export function fontFallback(family: string, customFonts: CustomFont[] = []): string {
  const opt = FONT_CATALOG.find(f => f.family === family);
  if (opt) return GENERIC_FALLBACK[opt.category];
  if (customFonts.some(f => f.family === family)) return 'system-ui, sans-serif';
  return 'system-ui, sans-serif';
}

export function loadGoogleFont(family: string): void {
  if (typeof document === 'undefined') return;
  const opt = FONT_CATALOG.find(f => f.family === family);
  if (!opt || opt.source !== 'google') return;
  const id = 'gf-' + family.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

/** Carga todas las fuentes del catálogo (para el selector con vista previa). */
export function loadAllCatalogFonts(): void {
  for (const f of FONT_CATALOG) if (f.source === 'google') loadGoogleFont(f.family);
}

export function injectCustomFonts(fonts: CustomFont[]): void {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('custom-brand-fonts') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'custom-brand-fonts';
    document.head.appendChild(style);
  }
  style.textContent = fonts.map(f => {
    const ext = (f.url.split('.').pop() || '').toLowerCase();
    const format = ext === 'otf' ? 'opentype' : ext === 'ttf' ? 'truetype' : ext === 'woff' ? 'woff' : 'woff2';
    return `@font-face { font-family: '${f.family.replace(/'/g, '')}'; src: url('${f.url}') format('${format}'); font-display: swap; }`;
  }).join('\n');
}

/* ------------------------------------------------------------------ */
/* Aplicación en el DOM                                                 */
/* ------------------------------------------------------------------ */

const VAR_MAP: Array<[keyof ResolvedTheme, string]> = [
  ['background', '--brand-bg'],
  ['card', '--brand-card'],
  ['card2', '--brand-card-2'],
  ['pill', '--brand-pill'],
  ['primary', '--brand-primary'],
  ['primaryStrong', '--brand-primary-strong'],
  ['button', '--brand-button'],
  ['onButton', '--brand-on-button'],
  ['surface', '--brand-surface'],
  ['dark', '--brand-dark'],
  ['accent', '--brand-accent'],
  ['muted', '--brand-muted'],
  ['wine', '--brand-wine'],
  ['onPrimary', '--brand-on-primary'],
  ['onDark', '--brand-on-dark'],
  ['onAccent', '--brand-on-accent'],
];

export function applyTheme(t: ResolvedTheme, customFonts: CustomFont[] = []): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, cssVar] of VAR_MAP) root.style.setProperty(cssVar, hexToHslTriplet(t[key] as string));
  root.classList.toggle('dark', t.mode === 'dark');
  root.style.colorScheme = t.mode;

  [t.fontHeading, t.fontBody, t.fontScript].forEach(loadGoogleFont);
  injectCustomFonts(customFonts);
  root.style.setProperty('--font-heading', `"${t.fontHeading}", ${fontFallback(t.fontHeading, customFonts)}`);
  root.style.setProperty('--font-body', `"${t.fontBody}", ${fontFallback(t.fontBody, customFonts)}`);
  root.style.setProperty('--font-script', `"${t.fontScript}", ${fontFallback(t.fontScript, customFonts)}`);

  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = t.surface;
}

export function setFavicon(url: string, appleUrl?: string): void {
  if (typeof document === 'undefined') return;
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = url;
  link.type = url.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  let apple = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (appleUrl) {
    if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple); }
    apple.href = appleUrl;
  }
}

type BrandName = 'bg' | 'card' | 'card-2' | 'pill' | 'primary' | 'primary-strong' | 'button' | 'on-button' | 'surface' | 'dark' | 'accent' | 'muted' | 'wine' | 'on-primary' | 'on-dark' | 'on-accent';

/** Lee el color actual de una variable de marca como hex (para gráficos y estilos inline). */
export function getBrandHex(name: BrandName): string {
  const fallback: Record<BrandName, string> = {
    bg: DEFAULT_THEME.background, card: DEFAULT_THEME.card, 'card-2': '#EFEDD8', pill: '#F5E6C0',
    primary: DEFAULT_THEME.primary, 'primary-strong': '#344268', button: '#344268', 'on-button': DEFAULT_THEME.background,
    surface: DEFAULT_THEME.dark, dark: DEFAULT_THEME.dark,
    accent: DEFAULT_THEME.accent, muted: DEFAULT_THEME.muted, wine: DEFAULT_THEME.wine,
    'on-primary': DEFAULT_THEME.background, 'on-dark': DEFAULT_THEME.background, 'on-accent': DEFAULT_THEME.dark,
  };
  if (typeof document === 'undefined') return fallback[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--brand-${name}`);
  return v ? hslTripletToHex(v, fallback[name]) : fallback[name];
}

/** Acceso cómodo a los colores vivos de la marca: BRAND.primary, BRAND.accent... */
export const BRAND = {
  get bg() { return getBrandHex('bg'); },
  get card() { return getBrandHex('card'); },
  get card2() { return getBrandHex('card-2'); },
  get pill() { return getBrandHex('pill'); },
  get primary() { return getBrandHex('primary'); },
  get primaryStrong() { return getBrandHex('primary-strong'); },
  get button() { return getBrandHex('button'); },
  get onButton() { return getBrandHex('on-button'); },
  get surface() { return getBrandHex('surface'); },
  get dark() { return getBrandHex('dark'); },
  get accent() { return getBrandHex('accent'); },
  get muted() { return getBrandHex('muted'); },
  get wine() { return getBrandHex('wine'); },
  get onPrimary() { return getBrandHex('on-primary'); },
  get onDark() { return getBrandHex('on-dark'); },
  get onAccent() { return getBrandHex('on-accent'); },
  get isDark() { return typeof document !== 'undefined' && document.documentElement.classList.contains('dark'); },
};

/* ------------------------------------------------------------------ */
/* Favicon a partir del logo                                            */
/* ------------------------------------------------------------------ */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}

export async function generateIconFromImage(src: string, size = 64, bgColor?: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');

  if (bgColor) {
    const r = size * 0.22;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0); ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r); ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size); ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }

  const pad = bgColor ? size * 0.14 : size * 0.04;
  const box = size - pad * 2;
  const iw = img.naturalWidth || img.width || box;
  const ih = img.naturalHeight || img.height || box;
  const scale = Math.min(box / iw, box / ih);
  const w = iw * scale, h = ih * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
