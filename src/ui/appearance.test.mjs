import test from 'node:test';
import assert from 'node:assert/strict';
import '../../scripts/source-loader.mjs';

const { resolveAppearance, createAppearanceController } = await import('./appearance.ts');

function environment(values = {}, systemLight = true) {
  let light = systemLight;
  const root = {};
  const documentRef = { documentElement: root, defaultView: null, createElement: () => ({ getContext: () => null }) };
  const listeners = new Map();
  const windowRef = {
    getComputedStyle: () => ({ getPropertyValue: name => values[name] ?? '' }),
    matchMedia: () => ({ get matches() { return light; }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } }),
    listeners,
  };
  documentRef.defaultView = windowRef;
  return { documentRef, windowRef, root, setSystemLight: value => { light = value; } };
}

test('follow mode preserves readable host ink and chooses QQJ fallbacks for unreadable surfaces and quote', () => {
  const env = environment({ '--SmartThemeBodyColor': 'rgb(240, 240, 240)', '--SmartThemeQuoteColor': '#ad4438', '--SmartThemeChatTintColor': 'rgba(0, 0, 0, 0.1)', '--SmartThemeBotMesBlurTintColor': 'rgba(255,255,255,.2)', '--SmartThemeUserMesBlurTintColor': 'transparent' });
  const automatic = resolveAppearance({ mode: 'auto', ...env });
  assert.equal(automatic.mode, 'auto');
  assert.equal(automatic.effectiveTheme, 'night');
  assert.equal(automatic.apiPalette.ink, 'rgb(240, 240, 240)');
  assert.equal(automatic.apiPalette.knot, '#d9707a');
  assert.equal(automatic.apiPalette.paper, 'rgb(17, 22, 24)');
  assert.equal(automatic.apiPalette.panel, '#1c2327');
  const fixed = resolveAppearance({ mode: 'day', ...env });
  assert.equal(fixed.mode, 'day');
  assert.equal(fixed.effectiveTheme, 'day');
  assert.equal(fixed.apiPalette.ink, '#22282b');
  assert.equal(fixed.apiPalette.knot, '#b63745');
});

test('auto uses system preference only without host body signal; fixed theme does not react to system changes', () => {
  const env = environment({}, true);
  assert.equal(resolveAppearance({ mode: 'auto', ...env }).effectiveTheme, 'day');
  assert.equal(resolveAppearance({ mode: 'night', ...env }).effectiveTheme, 'night');
});

test('system preference changes reapply only auto mode when the host has no theme signal', () => {
  const env = environment({}, true); const attrs = new Map(); const styles = new Map();
  const host = { style: { setProperty: (key, value) => styles.set(key, value), set colorScheme(value) { styles.set('color-scheme', value); } }, setAttribute: (key, value) => attrs.set(key, value) };
  let applied = 0;
  const controller = createAppearanceController({ host, settings: { get: () => ({ appearanceTheme: 'auto' }) }, ...env, onChange: () => applied++ });
  assert.equal(attrs.get('data-bmx-theme'), 'day');
  env.setSystemLight(false); env.windowRef.listeners.get('change')();
  assert.equal(attrs.get('data-bmx-theme'), 'night'); assert.equal(applied, 2);
  controller.destroy();
});

test('appearance applies only bmx host variables and destroys observers/listeners', () => {
  const values = { '--SmartThemeBodyColor': '#ffffff' };
  const env = environment(values);
  const styles = new Map(); const attrs = new Map(); let disconnected = false; let callback;
  class Observer { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; } }
  const mediaListeners = new Map();
  const windowRef = { ...env.windowRef, MutationObserver: Observer, matchMedia: () => ({ matches: true, addEventListener: (name, fn) => mediaListeners.set(name, fn), removeEventListener: name => mediaListeners.delete(name) }) };
  const doc = { ...env.documentRef, defaultView: windowRef, documentElement: {} };
  const host = { style: { setProperty: (key, value) => styles.set(key, value), set colorScheme(value) { styles.set('color-scheme', value); } }, setAttribute: (key, value) => attrs.set(key, value) };
  const controller = createAppearanceController({ host, settings: { get: () => ({ appearanceTheme: 'auto' }) }, documentRef: doc, windowRef });
  assert.equal(attrs.get('data-bmx-theme-mode'), 'auto'); assert.equal(styles.get('--bmx-ink'), '#ffffff'); assert.equal(styles.has('--ink'), false);
  values['--SmartThemeBodyColor'] = '#222222'; callback(); assert.equal(attrs.get('data-bmx-theme'), 'day');
  controller.destroy(); assert.equal(disconnected, true); assert.equal(mediaListeners.size, 0);
});
