import { DEFAULT_APPEARANCE_SCALE, normalizeAppearanceScale } from '../host/appearance-settings';
import type { AppearancePreferences, AppearanceThemeMode } from '../host/appearance-settings';
import { createAppearanceFont } from './appearance-font';
import { NIGHT_INTERFERENCE_COLORS, type InterferenceColors } from './blue-glass';

type Palette = Record<string, string>;
type ApiPalette = Record<'paper' | 'panel' | 'ink' | 'soft' | 'faint' | 'line' | 'thread' | 'crimson' | 'knot' | 'onPrimary' | 'blue' | 'success', string>;
type AppearanceSettings = { get(): Pick<AppearancePreferences, 'appearanceTheme'> & Partial<AppearancePreferences> };
const PALETTES: Record<'day' | 'night', Palette> = {
  "day": {
    "ink": "#302e2d",
    "muted": "#746d67",
    "faint": "#746d67",
    "base": "#faf8f4",
    "surface": "#fffdfa",
    "raised": "#f0ede7",
    "border": "#e1dbd3",
    "line": "#e1dbd3",
    "star": "#71617e",
    "selected": "#71617e",
    "action": "#71617e",
    "onAction": "#fff",
    "actionBorder": "#71617e",
    "danger": "#a34e4b",
    "hoverBorder": "#71617e",
    "windowShadow": "0 18px 54px #30282c24",
    "toolbarBorder": "#e1dbd3",
    "toolbarBg": "#faf8f4e6",
    "edgeFocus": "#71617e88",
    "starStroke": "#71617e",
    "starGlow": "#71617e55",
    "selectedStroke": "#71617e",
    "selectedGlow": "#71617e66",
    "overviewBg": "#fffdfaf5",
    "overviewShadow": "0 8px 28px #30282c20",
    "excerpt": "#746d67",
    "sectionBorder": "#e1dbd3",
    "articleBg": "#f0ede7",
    "inputBg": "#fffdfa",
    "success": "#557364"
  },
  "night": {
    "ink": "#eee8e2",
    "muted": "#b6aca5",
    "faint": "#b6aca5",
    "base": "#252325",
    "surface": "#2d2a2c",
    "raised": "#353034",
    "border": "#464044",
    "line": "#464044",
    "star": "#c3afcf",
    "selected": "#c3afcf",
    "action": "#c3afcf",
    "onAction": "#29222d",
    "actionBorder": "#c3afcf",
    "danger": "#e6a19a",
    "hoverBorder": "#c3afcf",
    "windowShadow": "0 18px 54px #00000055",
    "toolbarBorder": "#464044",
    "toolbarBg": "#252325e6",
    "edgeFocus": "#c3afcf88",
    "starStroke": "#c3afcf",
    "starGlow": "#c3afcf55",
    "selectedStroke": "#c3afcf",
    "selectedGlow": "#c3afcf66",
    "overviewBg": "#2d2a2cf5",
    "overviewShadow": "0 8px 28px #00000055",
    "excerpt": "#b6aca5",
    "sectionBorder": "#464044",
    "articleBg": "#353034",
    "inputBg": "#2d2a2c",
    "success": "#a0c4ae"
  }
};

// QQJ cache359 supplies the host palette used in follow mode.
const API_PALETTES: Record<'day' | 'night', ApiPalette> = {
  day: { paper: '#f7f8fa', panel: '#ffffff', ink: '#22282b', soft: '#637077', faint: '#929da2', line: '#dce2e5', thread: '#cbd4d8', crimson: '#b63745', knot: '#b63745', onPrimary: '#fff', blue: '#3b706a', success: '#3d6f55' },
  night: { paper: '#13181b', panel: '#1c2327', ink: '#e7ecee', soft: '#9db0b5', faint: '#6c7c81', line: '#2b363b', thread: '#33424a', crimson: '#d9707a', knot: '#d9707a', onPrimary: '#fff', blue: '#77b0aa', success: '#77b193' },
};
const API_AUTO_FALLBACK_PALETTES: Record<'day' | 'night', Omit<ApiPalette, 'onPrimary'>> = {
  day: { paper: '#e8ecec', panel: '#f6f8f8', ink: '#22282b', soft: '#5c6a70', faint: '#93a1a5', line: '#d0d9db', thread: '#c1ccce', crimson: '#a8322f', knot: '#a8322f', blue: '#3b706a', success: '#3d6f55' },
  night: API_PALETTES.night,
};
type ParsedColor = { css: string; rgb: number[]; alpha: number };

function color(documentRef: Document | undefined, raw = ''): ParsedColor | null {
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'transparent') return null;
  const hex = /^#([\da-f]{3,8})$/i.exec(value);
  if (hex) {
    const body = hex[1].length <= 4 ? [...hex[1]].map(char => char + char).join('') : hex[1];
    if (body.length !== 6 && body.length !== 8) return null;
    return { css: `#${body.slice(0, 6)}`, rgb: [0, 2, 4].map(index => Number.parseInt(body.slice(index, index + 2), 16)), alpha: body.length === 8 ? Number.parseInt(body.slice(6), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)(?:\s*(?:,|\/)\s*([-+]?(?:\d*\.)?\d+%?))?\s*\)$/i.exec(value);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(channel => {
      const parsed = Number.parseFloat(channel);
      return channel.endsWith('%') ? Math.round(Math.min(100, Math.max(0, parsed)) * 2.55) : Math.round(Math.min(255, Math.max(0, parsed)));
    });
    const alpha = rgb[4] ? Math.min(1, Math.max(0, Number.parseFloat(rgb[4]) / (rgb[4].endsWith('%') ? 100 : 1))) : 1;
    return { css: `rgb(${channels.join(', ')})`, rgb: channels, alpha };
  }
  try {
    const context = documentRef?.createElement('canvas').getContext('2d');
    if (!context) return null;
    context.fillStyle = '#010203'; context.fillStyle = value;
    if (context.fillStyle === '#010203' && value.toLowerCase() !== '#010203') return null;
    context.fillRect(0, 0, 1, 1); const sample = context.getImageData(0, 0, 1, 1).data;
    return { css: `rgb(${sample[0]}, ${sample[1]}, ${sample[2]})`, rgb: [sample[0], sample[1], sample[2]], alpha: sample[3] / 255 };
  } catch { return null; }
}
const blend = (documentRef: Document | undefined, overlay: string, base: string, qqjApi = false) => {
  const top = color(documentRef, overlay), under = color(documentRef, base);
  if (qqjApi && (!top || !under || top.alpha <= 0)) return base;
  if (!top || !under || top.alpha >= 1) return top?.css ?? base;
  return `rgb(${top.rgb.map((channel, index) => Math.round(channel * top.alpha + under.rgb[index] * (1 - top.alpha))).join(', ')})`;
};
const relativeLuminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
  const value = channel / 255, linear = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][index];
}, 0);
const foregroundForColor = (parsed: ParsedColor | null, qqjApi = false) => {
  if (!parsed) return qqjApi ? '#fff' : '#ffffff';
  const accentLuminance = relativeLuminance(parsed.rgb), darkLuminance = relativeLuminance([34, 40, 43]);
  const darkContrast = (accentLuminance + .05) / (darkLuminance + .05), lightContrast = 1.05 / (accentLuminance + .05);
  return darkContrast >= lightContrast ? (qqjApi ? '#22282b' : '#222a2e') : (qqjApi ? '#fff' : '#ffffff');
};
const foregroundFor = (accent: string, documentRef?: Document) => foregroundForColor(color(documentRef, accent));

function contrast(documentRef: Document | undefined, foreground: string, background: string) {
  const ink = color(documentRef, foreground), surface = color(documentRef, background);
  if (!ink || !surface) return 0;
  return contrastRgb(ink.rgb, surface.rgb);
}

// QQJ cache359 resolves readable host surfaces before choosing a quote color.
// This palette can be consumed independently of the Interference texture.
function apiPaletteFor(mode: AppearanceThemeMode, effectiveTheme: 'day' | 'night', signals: Record<string, string>, documentRef?: Document): ApiPalette {
  if (mode !== 'auto') {
    const palette = API_PALETTES[effectiveTheme];
    return { ...palette, onPrimary: foregroundForColor(color(documentRef, palette.knot), true) };
  }
  const palette = API_AUTO_FALLBACK_PALETTES[effectiveTheme];
  const opaque = (raw: string, fallback: string) => color(documentRef, raw)?.css ?? fallback;
  const readable = (foreground: string, ...surfaces: string[]) => surfaces.every(surface => contrast(documentRef, foreground, surface) >= 4.5);
  const ink = opaque(signals.body, palette.ink);
  function surface(tint: string, fallback: string) {
    const candidate = blend(documentRef, tint, fallback, true);
    if (readable(ink, candidate) && readable(palette.soft, candidate)) return candidate;
    const hostUi = blend(documentRef, signals.blur, fallback, true);
    return readable(ink, hostUi) && readable(palette.soft, hostUi) ? hostUi : fallback;
  }
  const paper = surface(signals.chat, palette.paper), panel = surface(signals.bot, palette.panel);
  const finalInk = readable(ink, paper, panel) ? ink : palette.ink;
  function foreground(raw: string, fallback: string) {
    const candidate = opaque(raw, fallback);
    if (readable(candidate, paper, panel)) return candidate;
    return readable(fallback, paper, panel) ? fallback : finalInk;
  }
  const accent = foreground(signals.quote, palette.knot);
  const accentColor = color(documentRef, accent)!;
  const primaryText = foregroundForColor(accentColor, true);
  const noteSurface = blend(documentRef, `rgba(${accentColor.rgb.join(', ')}, .09)`, panel, true);
  return {
    ...palette, paper, panel, ink: finalInk, soft: readable(palette.soft, noteSurface) ? palette.soft : palette.ink,
    knot: accent, crimson: foreground(signals.quote, palette.crimson), blue: foreground(signals.quote, palette.blue),
    success: foreground('', palette.success), thread: blend(documentRef, signals.user, palette.thread, true),
    onPrimary: readable(primaryText, accent) ? primaryText : '#000',
  };
}

export function resolveAppearance({ mode = 'auto', documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? (globalThis as unknown as Window) }: { mode?: AppearanceThemeMode; documentRef?: Document; windowRef?: Window } = {}) {
  const root = documentRef?.documentElement;
  let signals: Record<string, string> = {};
  try {
    const computed = windowRef?.getComputedStyle(root);
    const read = (name: string) => computed?.getPropertyValue(name).trim() ?? '';
    signals = { body: read('--SmartThemeBodyColor'), quote: read('--SmartThemeQuoteColor'), chat: read('--SmartThemeChatTintColor'), blur: read('--SmartThemeBlurTintColor'), bot: read('--SmartThemeBotMesBlurTintColor'), user: read('--SmartThemeUserMesBlurTintColor') };
  } catch { /* Missing host theme values use the system palette. */ }
  const body = color(documentRef, signals.body);
  const hostTheme = body ? ((.2126 * body.rgb[0] + .7152 * body.rgb[1] + .0722 * body.rgb[2]) > 127 ? 'night' : 'day') : null;
  const systemTheme = windowRef?.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'day' : 'night';
  const effectiveTheme = mode === 'auto' ? hostTheme ?? systemTheme : mode;
  const palette = { ...PALETTES[effectiveTheme] };
  if (mode === 'auto') {
    const quote = color(documentRef, signals.quote)?.css ?? palette.selected;
    palette.ink = body?.css ?? palette.ink;
    palette.selected = quote; palette.action = quote; palette.actionBorder = quote; palette.onAction = foregroundFor(quote, documentRef);
    palette.base = blend(documentRef, signals.chat, palette.base);
    palette.surface = blend(documentRef, signals.bot, palette.surface);
    palette.line = blend(documentRef, signals.user, palette.line);
  }
  return { mode, effectiveTheme, palette, apiPalette: apiPaletteFor(mode, effectiveTheme, signals, documentRef), hasHostSignal: Boolean(body) };
}

type Rgb = InterferenceColors[number];
const DAY_INTERFERENCE_COLORS: InterferenceColors = [[177, 209, 234], [236, 193, 150]];
const NIGHT_DIALOG = {
  panel: '#254e7b', paper: 'rgb(255 255 255 / .045)', ink: '#f1f6f7', soft: '#d8e4e9', faint: '#c5d5dd',
  line: 'rgb(255 255 255 / .19)', knot: '#e2d9ee', crimson: '#ffc1b8', success: '#c0e3cc', onPrimary: '#1b3040',
};
const DAY_DIALOG = {
  panel: '#eef5fa', paper: '#faf7f0', ink: '#1f2b38', soft: '#3f5467', faint: '#465e72',
  line: '#a4b7c5', knot: '#31567b', crimson: '#883948', success: '#2f5b46', onPrimary: '#fff',
};
const NIGHT_GLASS_INK = '#f1f6f7';
const WASH_NIGHT: Rgb = [13, 21, 28];
const WASH_DAY: Rgb = [255, 255, 255];
const mixRgb = (from: Rgb, to: Rgb, ratio: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * ratio),
  Math.round(from[1] + (to[1] - from[1]) * ratio),
  Math.round(from[2] + (to[2] - from[2]) * ratio),
];
const rgbCss = (rgb: Rgb) => `rgb(${rgb.join(', ')})`;
function contrastRgb(first: number[], second: number[]) {
  const a = relativeLuminance(first), b = relativeLuminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

// Bound all texture pixels and their blur by the least readable RGB corner.
function glassContrastSurface([a, b]: InterferenceColors, dark: boolean): Rgb {
  const extreme = dark ? Math.max : Math.min;
  return mixRgb(
    [extreme(a[0], b[0]), extreme(a[1], b[1]), extreme(a[2], b[2])],
    dark ? WASH_NIGHT : WASH_DAY,
    dark ? .16 : .11,
  );
}

function hearingPastInk(ink: string, texture: InterferenceColors, dark: boolean): string {
  const current = color(undefined, ink)!.rgb as Rgb;
  const surface = glassContrastSurface(texture, dark);
  let past = current;
  for (let percent = 2; percent <= 36; percent += 2) {
    const next = mixRgb(current, surface, percent / 100);
    // Leave a small margin for the glass filter and browser channel rounding.
    if (contrastRgb(next, surface) < 4.6) break;
    past = next;
  }
  return rgbCss(past);
}

function resolveGlassAppearance(theme: ReturnType<typeof resolveAppearance>) {
  const { mode, effectiveTheme, apiPalette } = theme;
  const dark = effectiveTheme === 'night';
  const wash = dark ? WASH_NIGHT : WASH_DAY;
  const opacity = dark ? .16 : .11;
  const washCss = `rgb(${wash.join(' ')} / ${String(opacity).replace(/^0/, '')})`;
  if (mode === 'night') {
    return {
      textureColors: NIGHT_INTERFERENCE_COLORS,
      shell: { background: '#224e84', wash: washCss, drawer: 'rgb(34 78 132 / .94)' } as Palette,
      dialog: NIGHT_DIALOG,
      nativeDialog: { ...NIGHT_DIALOG, panel: '#224e84', paper: '#1c416f', line: 'rgba(255,255,255,.2)' },
    };
  }

  const dialog = mode === 'auto' ? apiPalette : DAY_DIALOG;
  const rgb = (value: string) => color(undefined, value)!.rgb as Rgb;
  const paper = rgb(dialog.paper);
  const accent = rgb(dialog.knot);
  let textureColors: InterferenceColors = mode === 'day'
    ? DAY_INTERFERENCE_COLORS
    : [paper, mixRgb(accent, paper, dark ? .62 : .405)];

  const textLimit: Rgb = dark ? WASH_DAY : [0, 0, 0];
  if (mode === 'auto') {
    // An extreme host tint can leave too little room even for black or white text.
    // Move the endpoints toward the same glass wash, preserving the texture coordinates.
    while (contrastRgb(textLimit, glassContrastSurface(textureColors, dark)) < 5) {
      textureColors = [mixRgb(textureColors[0], wash, .2), mixRgb(textureColors[1], wash, .2)];
    }
  }
  const surface = glassContrastSurface(textureColors, dark);
  function readable(value: string) {
    let ink = rgb(value);
    while (contrastRgb(ink, surface) < 4.7 ||
      (dark ? relativeLuminance(ink) < relativeLuminance(surface) : relativeLuminance(ink) > relativeLuminance(surface))) {
      const next = mixRgb(ink, textLimit, .25);
      if (next.every((channel, index) => channel === ink[index])) return rgbCss(textLimit);
      ink = next;
    }
    return rgbCss(ink);
  }
  const ink = readable(dark ? dialog.ink : mode === 'auto' ? '#1b2c3f' : '#1f2b38');
  const muted = readable(dark ? dialog.soft : '#3f5467');
  const selected = readable(dialog.knot);
  const onAction = foregroundForColor(color(undefined, selected), true);
  return {
    textureColors, dialog, nativeDialog: dialog,
    shell: {
      background: rgbCss(textureColors[0]), wash: washCss, drawer: dialog.panel,
      ink, muted, faint: muted, selected, onAction,
      success: readable(dialog.success), danger: readable(dialog.crimson),
      waiting: readable(dark ? '#f3dfbd' : '#724518'),
    } as Palette,
  };
}

export function applyAppearance(host: HTMLElement, mode: AppearanceThemeMode, documentRef: Document = document, windowRef: Window = window) {
  const appearance = resolveAppearance({ mode, documentRef, windowRef });
  const glass = resolveGlassAppearance(appearance);
  host.setAttribute('data-bmx-theme', appearance.effectiveTheme);
  host.setAttribute('data-bmx-theme-mode', appearance.mode);
  host.style.colorScheme = appearance.effectiveTheme === 'day' ? 'light' : 'dark';
  const variables = (prefix: string, palette: Palette) => {
    for (const [key, value] of Object.entries(palette)) host.style.setProperty(
      `${prefix}${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, value,
    );
  };
  variables('--bmx-', appearance.palette);
  // Write every shell token on each mode transition so an omitted night token clears the prior value.
  variables('--bmx-glass-', {
    ink: NIGHT_GLASS_INK, muted: '#d8e4e9', faint: '#c5d5dd', selected: '#e2d9ee', onAction: '#1b3040',
    success: '#b0d1be', danger: '#e6a19a', waiting: '#f3dfbd', ...glass.shell,
  });
  host.style.setProperty('--bmx-hearing-past', hearingPastInk(
    glass.shell.ink ?? NIGHT_GLASS_INK, glass.textureColors, appearance.effectiveTheme === 'night',
  ));
  variables('--bmx-api-', { ...appearance.apiPalette, ...glass.dialog });
  const { panel, soft, crimson, success } = appearance.apiPalette;
  variables('--bmx-health-', { panel, soft, crimson, success });
  return { ...appearance, glass };
}

export type AppearanceState = ReturnType<typeof applyAppearance> & { scale: number; fixedScale: number; family: string };

export function createAppearanceController({ host, settings, documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? (globalThis as unknown as Window), fetchImpl = globalThis.fetch, onChange, deferFont = false }: {
  host: HTMLElement;
  settings: AppearanceSettings;
  documentRef?: Document;
  windowRef?: Window;
  fetchImpl?: typeof fetch;
  onChange?: (value: AppearanceState) => void;
  deferFont?: boolean;
}) {
  let destroyed = false;
  let fontActive = !deferFont;
  let current: AppearanceState;
  const font = createAppearanceFont({ documentRef, fetchImpl, onChange: publishFont });
  const currentMode = () => settings.get().appearanceTheme;

  function applyFontFamily(family: string) {
    host.style.setProperty('--qqj-custom-font', family ? `"${family}"` : 'system-ui');
  }

  function publishFont() {
    if (destroyed || !current) return;
    current = { ...current, family: font.getFamily() };
    applyFontFamily(current.family);
    onChange?.(current);
  }

  function apply() {
    if (destroyed) return current;
    const { appearanceTheme, appearanceScale, appearanceFontCssUrl } = settings.get();
    const value = applyAppearance(host, appearanceTheme, documentRef, windowRef);
    const scale = normalizeAppearanceScale(appearanceScale);
    const fixedScale = scale / DEFAULT_APPEARANCE_SCALE;
    host.style.setProperty('--qqj-ui-scale', String(scale));
    host.style.setProperty('--qqj-ui-fixed-scale', String(fixedScale));
    if (fontActive) font.setUrl(appearanceFontCssUrl ?? '');
    current = { ...value, scale, fixedScale, family: font.getFamily() };
    applyFontFamily(current.family);
    onChange?.(current);
    return current;
  }

  const Observer = (windowRef as Window & { MutationObserver?: typeof MutationObserver })?.MutationObserver ?? globalThis.MutationObserver;
  const observer = documentRef?.documentElement && typeof Observer === 'function' ? new Observer(() => { if (currentMode() === 'auto') apply(); }) : null;
  observer?.observe(documentRef.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  const media = windowRef?.matchMedia?.('(prefers-color-scheme: light)');
  const onSystem = () => { if (currentMode() === 'auto' && !current.hasHostSignal) apply(); };
  media?.addEventListener?.('change', onSystem);
  apply();
  function loadFont(){
    if(destroyed||fontActive)return;
    fontActive=true;
    font.setUrl(settings.get().appearanceFontCssUrl??'');
  }
  return { apply, loadFont, getState: () => current, destroy() {
    destroyed = true;
    observer?.disconnect();
    media?.removeEventListener?.('change', onSystem);
    font.destroy();
  } };
}
