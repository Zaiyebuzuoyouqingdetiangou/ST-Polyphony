import { normalizeFontCssUrl } from '../host/appearance-settings';

type FontCss = { family: string; css: string };

// Shadow roots share the document font set. Register only font-face rules from the CSS URL.
function readFontCss(source: string, baseUrl: string): FontCss | null {
  const rules = source.replace(/\/\*[\s\S]*?\*\//g, '').match(/@font-face\s*\{[^{}]*\}/gi) ?? [];
  const name = /font-family\s*:\s*(['"]?)([^;'"}]+)\1/i;
  const family = rules[0]?.match(name)?.[2].trim().replace(/["\\\r\n]/g, ' ').replace(/\s+/g, ' ');
  if (!family) return null;
  const css = rules.map(rule => rule.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_, double, single, bare) => {
    const url = new URL((double ?? single ?? bare).trim(), baseUrl);
    return ['http:', 'https:', 'data:'].includes(url.protocol) ? `url("${url.href.replaceAll('"', '%22')}")` : 'url("")';
  })).join('\n');
  return { family, css };
}

export function createAppearanceFont({ documentRef, fetchImpl, onChange }: {
  documentRef?: Document;
  fetchImpl: typeof fetch;
  onChange(): void;
}) {
  const cache = new Map<string, FontCss>();
  let requestedUrl = '';
  let revision = 0;
  let style: HTMLStyleElement | undefined;
  let family = '';

  function register(font: FontCss) {
    if (!documentRef?.head) return;
    style = documentRef.createElement('style');
    style.setAttribute('data-bmx-custom-font', '');
    style.textContent = font.css;
    documentRef.head.appendChild(style);
    family = font.family;
  }

  function setUrl(value: string) {
    let url = '';
    try { url = normalizeFontCssUrl(value); } catch { /* Legacy invalid URLs use the system font. */ }
    if (url === requestedUrl) return;
    requestedUrl = url;
    const pending = ++revision;
    style?.remove();
    style = undefined;
    family = '';
    if (!url) return;
    const cached = cache.get(url);
    if (cached) { register(cached); return; }
    void (async () => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok || pending !== revision) return;
        const font = readFontCss(await response.text(), response.url || url);
        if (!font || pending !== revision) return;
        cache.set(url, font);
        register(font);
        onChange();
      } catch { /* Offline, unreadable or invalid CSS leaves the system font active. */ }
    })();
  }

  return { setUrl, getFamily: () => family, destroy() { revision++; style?.remove(); cache.clear(); } };
}
