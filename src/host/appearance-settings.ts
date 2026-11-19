import { getHostContext } from './host-context';

export type AppearanceThemeMode = 'auto' | 'day' | 'night';
export type AppearancePreferences = {
  appearanceTheme: AppearanceThemeMode;
  appearanceScale: number;
  appearanceFontCssUrl: string;
  fabShow: boolean;
};

export const DEFAULT_APPEARANCE_SCALE = .85;
export const DEFAULT_FONT_CSS_URL = 'https://fontsapi.zeoseven.com/387/main/result.css';
const modes = new Set<AppearanceThemeMode>(['auto', 'day', 'night']);

export function normalizeAppearanceScale(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return DEFAULT_APPEARANCE_SCALE;
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.min(1.5, Math.max(.75, scale)) : DEFAULT_APPEARANCE_SCALE;
}

export function normalizeFontCssUrl(value: string): string {
  const input = value.trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch { /* Keep the last saved preference if the input is invalid. */ }
  throw new Error('请输入有效的字体 CSS URL。');
}

function readOwnSettings(settings?: Record<string, unknown>): Record<string, unknown> {
  const own = settings?.['st-dollars'];
  return own && typeof own === 'object' ? own as Record<string, unknown> : {};
}

export function createAppearanceSettings(getContext = getHostContext) {
  return {
    get(): AppearancePreferences {
      const own = readOwnSettings(getContext()?.extensionSettings);
      const mode = own.appearanceTheme as AppearanceThemeMode;
      return {
        appearanceTheme: modes.has(mode) ? mode : 'auto',
        appearanceScale: normalizeAppearanceScale(own.appearanceScale),
        appearanceFontCssUrl: typeof own.appearanceFontCssUrl === 'string' ? own.appearanceFontCssUrl.trim() : DEFAULT_FONT_CSS_URL,
        fabShow: own.fabShow !== false,
      };
    },
    save(patch: Partial<AppearancePreferences>): void {
      const context = getContext();
      const settings = context?.extensionSettings;
      if (!settings || typeof context.saveSettingsDebounced !== 'function') throw new Error('无法保存百面相外观设置。');
      const next = { ...readOwnSettings(settings), ...patch };
      if (patch.appearanceTheme !== undefined) next.appearanceTheme = modes.has(patch.appearanceTheme) ? patch.appearanceTheme : 'auto';
      if (patch.appearanceScale !== undefined) next.appearanceScale = normalizeAppearanceScale(patch.appearanceScale);
      if (patch.appearanceFontCssUrl !== undefined) next.appearanceFontCssUrl = normalizeFontCssUrl(patch.appearanceFontCssUrl);
      settings['st-dollars'] = next;
      context.saveSettingsDebounced();
    },
  };
}
