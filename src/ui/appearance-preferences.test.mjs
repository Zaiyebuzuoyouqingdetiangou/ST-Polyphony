import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryHost, MemoryNode, Events, settle } from './testing/production-vue.mjs';
const { createAppearanceSettings } = await import('../host/appearance-settings.ts');
const { createAppearanceController } = await import('./appearance.ts');
const { default: AppearanceSettings } = await import('./AppearanceSettings.vue');

const font387 = 'https://fontsapi.zeoseven.com/387/main/result.css';
const hostSettings = saved => {
  let writes = 0;
  const context = { extensionSettings: { 'st-dollars': saved }, saveSettingsDebounced: () => writes++ };
  return { context, settings: createAppearanceSettings(() => context), writes: () => writes };
};

test('old settings read 85% and 387 without migrating, and preference writes preserve existing fields', () => {
  const { context, settings, writes } = hostSettings({ appearanceTheme: 'night', pluginEnabled: false, developmentEveryReplies: 4, extra: { keep: true } });
  const initial = settings.get();
  assert.equal(initial.appearanceTheme, 'night');
  assert.equal(initial.appearanceScale, 0.85);
  assert.equal(initial.appearanceFontCssUrl, font387);
  assert.equal(writes(), 0);
  settings.save({ appearanceScale: 1.25, appearanceFontCssUrl: '', fabShow: false });
  assert.deepEqual(context.extensionSettings['st-dollars'], {
    appearanceTheme: 'night', appearanceScale: 1.25, appearanceFontCssUrl: '', fabShow: false,
    pluginEnabled: false, developmentEveryReplies: 4, extra: { keep: true },
  });
  assert.equal(settings.get().appearanceFontCssUrl, '');
  assert.equal(writes(), 1);
});

test('the three appearance controls write only on change and the dropdown follows the header setting', async t => {
  const { settings, writes } = hostSettings({});
  const host = createMemoryHost();
  t.after(() => host.cleanup());
  const { reactive } = await import('vue');
  const preferences = reactive({ ...settings.get() });
  const save = patch => { settings.save(patch); Object.assign(preferences, settings.get()); };
  const { container } = await host.mount(AppearanceSettings, { preferences, save });
  const controls = container.querySelectorAll('.settings-field');
  assert.equal(controls.length, 3);
  assert.equal(container.querySelectorAll('input[type=checkbox]').length, 0);
  const trigger = container.querySelector('.bmx-inline-select-trigger');
  assert.equal(trigger.querySelector('.bmx-inline-select-value').textContent, '跟随酒馆');
  trigger.fire('click');
  await settle();
  container.querySelectorAll('[role=option]').find(node => node.textContent === '夜间').fire('keydown', { key: 'Enter' });
  assert.equal(settings.get().appearanceTheme, 'night');
  assert.equal(writes(), 1);
  save({ appearanceTheme: 'auto' });
  await settle();
  assert.equal(trigger.querySelector('.bmx-inline-select-value').textContent, '跟随酒馆');

  const slider = container.querySelector('input[type=range]');
  assert.deepEqual([slider.props.min, slider.props.max, slider.props.step, String(slider.value)], ['0.75', '1.5', '0.05', '0.85']);
  slider.value = '1.25';
  slider.fire('input');
  await settle();
  assert.equal(container.querySelector('output').textContent, '125%');
  assert.equal(writes(), 2);
  slider.fire('change');
  await settle();
  assert.equal(settings.get().appearanceScale, 1.25);
  const font = container.querySelector('input[placeholder]');
  assert.equal(font.value, font387);
  font.value = '';
  font.fire('change');
  await settle();
  assert.equal(settings.get().appearanceFontCssUrl, '');
  assert.equal(writes(), 4);
});

test('one font request per URL change, synchronized fallback and late responses ignored', async () => {
  const { settings, writes } = hostSettings({ appearanceFontCssUrl: 'https://font.test/a.css' });
  const request = new Map();
  const requests = [];
  const fetchImpl = url => { requests.push(url); return new Promise(resolve => request.set(url, resolve)); };
  const documentRef = {
    createElement: tag => new MemoryNode(tag), head: new MemoryNode('head'), documentElement: {},
  };
  const windowRef = new Events();
  windowRef.getComputedStyle = () => ({ getPropertyValue: () => '' });
  const host = new MemoryNode('div');
  host.style.removeProperty = key => delete host.style[key];
  const applied = [];
  const controller = createAppearanceController({ host, settings, documentRef, windowRef, fetchImpl, onChange: value => applied.push(value) });
  controller.apply();
  assert.deepEqual(requests, ['https://font.test/a.css']);
  assert.equal(host.style['--qqj-ui-scale'], '0.85');
  assert.equal(host.style['--qqj-ui-fixed-scale'], '1');

  settings.save({ appearanceFontCssUrl: 'https://font.test/b.css', appearanceScale: 1.275 });
  controller.apply();
  request.get('https://font.test/b.css')({ ok: true, url: 'https://font.test/b.css', text: async () => '@font-face{font-family:"Font B";src:url(b.woff2);unicode-range:U+0000-00FF} body{color:red}' });
  await settle();
  assert.equal(host.style['--qqj-custom-font'], '"Font B"');
  assert.equal(applied.at(-1).family, 'Font B');
  assert.equal(applied.at(-1).fixedScale, 1.5);
  assert.match(documentRef.head.textContent, /https:\/\/font.test\/b.woff2/);
  assert.doesNotMatch(documentRef.head.textContent, /body/);

  request.get('https://font.test/a.css')({ ok: true, text: async () => '@font-face{font-family:"Stale"}' });
  await settle();
  assert.equal(applied.at(-1).family, 'Font B');

  settings.save({ appearanceFontCssUrl: 'https://font.test/403.css' });
  controller.apply();
  assert.equal(applied.at(-1).family, '');
  assert.equal(documentRef.head.children.length, 0);
  request.get('https://font.test/403.css')({ ok: false, status: 403, text: async () => { assert.fail('must not parse an error page'); } });
  await settle();
  assert.equal(applied.at(-1).family, '');
  assert.equal(host.style['--qqj-custom-font'], 'system-ui');
  controller.apply();
  assert.equal(requests.length, 3);
  assert.equal(writes(), 2);
  controller.destroy();
});

test('the FAB toggle shows pending state accessibly even while the plugin is off', async t => {
  const PanelShell = (await import('./PanelShell.vue')).default;
  const host = createMemoryHost();
  t.after(() => host.cleanup());
  const createElement = host.documentRef.createElement;
  host.documentRef.createElement = tag => tag === 'canvas' ? {
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    toDataURL: () => 'data:image/png;base64,eA==',
  } : createElement(tag);
  let toggles = 0;
  const { container } = await host.mount(PanelShell, { page: 'sight', visible: false, fabShown: false, onFab: () => toggles++ });
  const toggle = container.querySelector('.bmx-fab-toggle');
  assert.ok(toggle);
  assert.equal(toggle.props['aria-pressed'], false);
  assert.equal(toggle.props['aria-label'], '显示悬浮球');
  toggle.fire('click');
  assert.equal(toggles, 1);
});

test('FAB stores only desktop drags, restores both viewport positions, and keeps keyboard or short clicks', async t => {
  const { createFab } = await import('./fab.ts');
  const host = createMemoryHost();
  t.after(() => host.cleanup());
  const element = host.documentRef.createElement;
  host.documentRef.createElement = tag => {
    const node = element(tag);
    node.attachShadow = () => node.shadowRoot = new MemoryNode('shadow');
    node.getBoundingClientRect = () => ({ left: parseFloat(node.style.left), top: parseFloat(node.style.top) });
    return node;
  };
  const store = new Map([['st-dollars-fab-pos', '{"x":150,"y":175}']]);
  const writes = [];
  const storage = { getItem: key => store.get(key), setItem: (key, value) => { store.set(key, value); writes.push(value); } };
  host.viewport.innerWidth = 1000;
  let opened = 0;
  const fab = createFab({
    documentRef: host.documentRef, windowRef: host.viewport, storage, onClick: () => opened++,
    presentation: { icon: '<svg/>', defaultPosition: ({ mobile }) => mobile ? { x: 12, y: 48 } : { x: 22, y: 50 } },
  });
  t.after(() => fab.destroy());
  const { button } = fab;
  const pos = () => [fab.host.style.left, fab.host.style.top];
  assert.deepEqual(pos(), ['150px', '175px']);
  fab.setVisible(true, false);
  assert.equal(fab.host.style.display, 'none');
  fab.setVisible(true, true);
  assert.equal(fab.host.style.display, '');

  button.fire('pointerdown', { clientX: 150, clientY: 175 });
  button.fire('pointermove', { clientX: 153, clientY: 179 });
  button.fire('pointerup');
  button.fire('click', { detail: 1 });
  assert.equal(opened, 1);
  assert.equal(writes.length, 0);

  button.fire('pointerdown', { clientX: 150, clientY: 175 });
  button.fire('pointermove', { clientX: 2000, clientY: -200 });
  button.fire('pointerup', { clientX: 2000, clientY: -200 });
  button.fire('click', { detail: 1 });
  assert.equal(opened, 1);
  assert.deepEqual(pos(), ['964px', '0px']);
  assert.deepEqual(JSON.parse(writes[0]), { x: 964, y: 0 });
  button.fire('click', { detail: 0 });
  assert.equal(opened, 2);

  host.viewport.innerWidth = 390;
  host.viewport.dispatch('resize');
  assert.deepEqual(pos(), ['12px', '48px']);
  button.fire('pointerdown', { clientX: 12, clientY: 48 });
  button.fire('pointermove', { clientX: 42, clientY: 78 });
  button.fire('pointerup', { clientX: 42, clientY: 78 });
  assert.equal(writes.length, 1);
  host.viewport.innerWidth = 1000;
  host.viewport.dispatch('resize');
  assert.deepEqual(pos(), ['964px', '0px']);
  host.viewport.innerWidth = 390;
  host.viewport.dispatch('resize');
  assert.deepEqual(pos(), ['42px', '78px']);
  button.fire('pointerdown', { clientX: 42, clientY: 78 });
  button.fire('pointermove', { clientX: 60, clientY: 100 });
  button.fire('pointercancel');
  assert.deepEqual(pos(), ['42px', '78px']);
  fab.setVisible(false, true);
  assert.equal(fab.host.style.display, 'none');
});

test('hearing and taste share a scalable body size, with compact history and first-circle spacing', async () => {
  const stylesheet = readFileSync(new URL('./record-pages.css', import.meta.url), 'utf8');
  const declarations = selector => new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]+)\\}`).exec(stylesheet)?.[1] ?? '';
  assert.match(declarations('.bmx-mood-description'), /font-size:\s*var\(--bmx-record-body-size\)/);
  assert.match(declarations('.bmx-hearing-step'), /font-size:\s*var\(--bmx-record-body-size\)/);
  assert.match(declarations('.bmx-hearing-previous'), /font-size:\s*calc\(11\.3px \* var\(--qqj-ui-fixed-scale,\s*1\)\)/);
  assert.match(stylesheet, /bmx-page-health\s*\+\s*\.bmx-mood-entry\s*\{\s*padding-top:\s*0/);
});

test('follow mode updates the open native dialog alongside the shell and fixed mode stays fixed', async t => {
  const { createDialogManager } = await import('./qqj/dialog.js');
  const { settings } = hostSettings({});
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  const { documentRef, viewport: windowRef } = memory;
  const entries = { '--SmartThemeBodyColor': '#222222', '--SmartThemeQuoteColor': '#71519a' };
  let systemLight = true;
  let callback;
  windowRef.getComputedStyle = () => ({ getPropertyValue: name => entries[name] ?? '' });
  windowRef.matchMedia = () => ({
    get matches() { return systemLight; },
    addEventListener: windowRef.addEventListener.bind(windowRef),
    removeEventListener: windowRef.removeEventListener.bind(windowRef),
  });
  windowRef.MutationObserver = class { constructor(fn) { callback = fn; } observe() {} disconnect() {} };
  documentRef.documentElement = new MemoryNode('html');
  documentRef.head = new MemoryNode('head');
  const openDialog = new MemoryNode('div');
  const classes = new Map();
  openDialog.classList = { toggle: (name, value) => classes.set(name, value) };
  documentRef.createElement = tag => {
    const node = new MemoryNode(tag);
    node.attachShadow = () => {
      const root = new MemoryNode('root');
      root.querySelector = selector => selector === '#sp-addon-dialog' ? openDialog : null;
      return root;
    };
    return node;
  };
  const dialog = createDialogManager({ documentRef, $() {} });
  const shell = new MemoryNode('div');
  const requests = [];
  const controller = createAppearanceController({
    host: shell, documentRef, windowRef, settings,
    fetchImpl: async url => {
      requests.push(url);
      return { ok: true, url, text: async () => "@font-face{font-family:'Nowar Rounded TW Wc';src:url('387.woff2')}" };
    },
    onChange: value => dialog.setAppearance({ ...value, palette: value.glass.nativeDialog }),
  });
  t.after(() => controller.destroy());
  await settle();
  assert.deepEqual(requests, [font387]);
  assert.equal(dialog.host.style['--qqj-dialog-font'], '"Nowar Rounded TW Wc", system-ui');
  assert.equal(dialog.host.style['--qqj-ui-scale'], '0.85');
  assert.equal(shell.getAttribute('data-bmx-theme'), 'day');
  assert.equal(shell.getAttribute('data-bmx-theme-mode'), 'auto');
  assert.equal(classes.get('sp-day'), true);
  assert.equal(shell.style['--bmx-api-knot'], '#71519a');
  entries['--SmartThemeBodyColor'] = '#efefef';
  callback();
  assert.equal(shell.getAttribute('data-bmx-theme'), 'night');
  assert.equal(classes.get('sp-night'), true);
  delete entries['--SmartThemeBodyColor'];
  callback();
  assert.equal(shell.getAttribute('data-bmx-theme'), 'day');
  systemLight = false;
  windowRef.dispatch('change');
  assert.equal(shell.getAttribute('data-bmx-theme'), 'night');

  settings.save({ appearanceTheme: 'day', appearanceScale: 1.5, appearanceFontCssUrl: '' });
  controller.apply();
  entries['--SmartThemeQuoteColor'] = '#ff0000';
  callback();
  assert.equal(shell.getAttribute('data-bmx-theme'), 'day');
  assert.equal(shell.getAttribute('data-bmx-theme-mode'), 'day');
  assert.equal(classes.get('sp-night'), false);
  assert.equal(dialog.host.style['--qqj-dialog-font'], 'system-ui');
  assert.equal(dialog.host.style['--qqj-dialog-scale'], String(1.5 / .85));
  assert.notEqual(shell.style['--bmx-api-knot'], '#ff0000');
  assert.deepEqual(requests, [font387]);
});

test('follow mode resolves legible message surfaces and quote color like installed QQJ cache359', async () => {
  const { resolveAppearance } = await import('./appearance.ts');
  const documentRef = { documentElement: {} };
  const cases = [
    {
      signals: { BodyColor: '#222222', QuoteColor: '#aabbcc', ChatTintColor: '#25282a', BotMesBlurTintColor: 'rgb(100, 120, 130)', BlurTintColor: 'rgba(120, 180, 220, .10)' },
      expected: ['day', '#e8ecec', 'rgb(233, 241, 245)', '#222222', '#22282b', '#a8322f', '#fff'],
    },
    {
      signals: { BodyColor: '#ececec', QuoteColor: '#93d2ff', ChatTintColor: '#efefef', BotMesBlurTintColor: '#111c22', BlurTintColor: 'rgba(0, 30, 55, .25)' },
      expected: ['night', 'rgb(14, 26, 34)', '#111c22', '#ececec', '#9db0b5', '#93d2ff', '#22282b'],
    },
    {
      signals: { BodyColor: '#3f5467', QuoteColor: '#7687a0', ChatTintColor: 'rgba(240, 245, 255, .65)', BotMesBlurTintColor: 'rgba(147, 190, 232, .30)', BlurTintColor: '#e9f0f7' },
      expected: ['day', 'rgb(237, 242, 248)', '#e9f0f7', '#3f5467', '#22282b', '#a8322f', '#fff'],
    },
  ];
  for (const { signals, expected } of cases) {
    const windowRef = { getComputedStyle: () => ({ getPropertyValue: key => signals[key.slice('--SmartTheme'.length)] ?? '' }) };
    const { effectiveTheme, apiPalette: palette } = resolveAppearance({ mode: 'auto', documentRef, windowRef });
    assert.deepEqual([effectiveTheme, palette.paper, palette.panel, palette.ink, palette.soft, palette.knot, palette.onPrimary], expected);
  }
});

test('dynamic Interference textures expire and evict older color picker values', async t => {
  const { createBlueGlassTexture } = await import('./blue-glass.ts');
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  let now = 0, draws = 0;
  t.mock.method(Date, 'now', () => now);
  memory.documentRef.createElement = () => ({
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() { draws++; } }),
    toDataURL: () => `texture-${draws}`,
  });
  const colors = red => [[red, 21, 26], [190, 210, 211]];
  const first = createBlueGlassTexture(colors(101));
  assert.equal(createBlueGlassTexture(colors(101)), first);
  for (const red of [102, 103, 104, 105]) createBlueGlassTexture(colors(red));
  assert.notEqual(createBlueGlassTexture(colors(101)), first);
  const latest = createBlueGlassTexture(colors(108));
  now += 65_000;
  assert.notEqual(createBlueGlassTexture(colors(108)), latest);
});

test('the production shell draws only visible Interference colors and reuses an unchanged texture', async t => {
  const { default: PanelShell } = await import('./PanelShell.vue');
  const { h, reactive } = await import('vue');
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  const createElement = memory.documentRef.createElement;
  let draws = 0;
  memory.documentRef.createElement = tag => tag === 'canvas' ? {
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() { draws++; } }),
    toDataURL: () => `texture-${draws}`,
  } : createElement(tag);
  const props = reactive({ page: 'sight', visible: false, fabShown: false, textureColors: [[18,55,191],[151,137,130]] });
  const { container } = await memory.mount({ setup: () => () => h(PanelShell, { ...props }) });
  const painting = () => container.querySelector('.bmx-blue-glass').props.style['--bmx-window-texture'];
  assert.equal(draws, 0);
  assert.equal(painting(), 'none');
  props.visible = true;
  await settle();
  const first = painting();
  assert.match(first, /texture-1/);
  memory.root.host.style.setProperty('--qqj-custom-font', '"Font B"');
  memory.root.host.style.setProperty('--qqj-ui-fixed-scale', '1.5');
  props.textureColors = [[18,55,191],[151,137,130]];
  await settle();
  assert.equal(draws, 1);
  assert.equal(painting(), first);
  props.visible = false;
  props.textureColors = [[18,55,194],[151,137,130]];
  props.textureColors = [[18,55,197],[151,137,130]];
  await settle();
  assert.equal(draws, 1);
  props.visible = true;
  await settle();
  assert.equal(draws, 2);
  assert.match(painting(), /texture-2/);
});

test('the shadow FAB uses QQJ transparent, interactive and scale-aware visual rules', async t => {
  const { createFab } = await import('./fab.ts');
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  const element = memory.documentRef.createElement;
  memory.documentRef.createElement = tag => {
    const node = element(tag);
    node.attachShadow = () => node.shadowRoot = new MemoryNode('shadow');
    return node;
  };
  const fab = createFab({
    documentRef: memory.documentRef, windowRef: memory.viewport, storage: { getItem: () => null },
    presentation: { icon: '<svg/>', defaultPosition: () => ({ x: 120, y: 240 }) },
    onClick() {},
  });
  t.after(() => fab.destroy());
  const css = fab.host.shadowRoot.querySelector('style').textContent.replace(/\s*([:;{},])\s*/g, '$1');
  const base = /(?:^|[}])button\{([^}]+)\}/.exec(css)[1].split(';');
  for (const declaration of [
    'width:36px', 'height:36px', 'box-sizing:border-box', 'border-radius:50%', 'background:transparent',
    'border:1.5px solid color-mix(in srgb,var(--qqj-fab-primary) 45%,var(--qqj-fab-surface))',
    'opacity:.45', 'box-shadow:0 4px 14px rgba(0,0,0,.4)',
    'transition:transform var(--qqj-motion-fast),box-shadow var(--qqj-motion-fast),color var(--qqj-motion-fast),background var(--qqj-motion-fast),opacity var(--qqj-motion-fast)',
  ]) assert.ok(base.includes(declaration), declaration);
  assert.match(css, /button:hover\{transform:scale\(1.1\);box-shadow:0 6px 20px rgba\(0,0,0,.5\);opacity:1\}/);
  assert.match(css, /button:active\{transform:scale\(.95\)\}/);
  assert.match(css, /button:focus-visible\{outline:var\(--qqj-focus-ring\) solid var\(--qqj-fab-ink\);outline-offset:3px;opacity:1\}/);
  assert.match(css, /--qqj-focus-ring:calc\(2px \* var\(--qqj-ui-scale,1\)\)/);
  assert.match(css, /--qqj-motion-fast:150ms/);
  assert.match(css, /svg\{width:24px;height:24px;display:block/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{button\{transition:none!important\}button:hover,button:active\{transform:none\}/);
});

test('the shared health strip keeps production states and QQJ size and palette', async t => {
  const { default: ModuleHealth } = await import('./ModuleHealth.vue');
  const { reactive } = await import('vue');
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  const state = reactive({ busy: false, error: '', source: { status: 'ready', message: '' }, world: { people: [{ id: 'p1' }] } });
  const development = reactive({ status: 'waiting', message: '等待新的稳定正文' });
  for (const width of [320, 390]) {
    memory.viewport.innerWidth = width;
    const { container } = await memory.mount(ModuleHealth, { state, development, readyLabel: '社交圈已载入' });
    const bar = container.querySelector('.bmx-page-health');
    assert.equal(bar.props.role, 'status');
    assert.equal(bar.textContent, '等待新的稳定正文');
    assert.equal(bar.matches('.healthy'), false);
    development.status = 'idle';
    await settle();
    assert.equal(bar.textContent, '社交圈已载入');
    assert.equal(bar.matches('.healthy'), true);
    state.error = '读取失败';
    await settle();
    assert.equal(bar.textContent, '读取失败');
    assert.equal(bar.props.role, 'alert');
    assert.equal(bar.matches('.healthy'), false);
    state.error = '';
    development.status = 'waiting';
  }
  for (const name of ['FourSenses.vue', 'HearingPage.vue', 'SmellPage.vue', 'TastePage.vue']) {
    assert.match(readFileSync(new URL(name, import.meta.url), 'utf8'), /<ModuleHealth\b/);
  }
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const glass = readFileSync(new URL('./blue-glass.css', import.meta.url), 'utf8');
  const records = readFileSync(new URL('./record-pages.css', import.meta.url), 'utf8');
  assert.match(css, /\.bmx-page:has\(> \.bmx-page-health\)\s*\{[^}]*padding:\s*calc\(12px \* var\(--qqj-ui-scale, \.85\)\) calc\(17px \* var\(--qqj-ui-scale, \.85\)\) calc\(20px \* var\(--qqj-ui-scale, \.85\)\)/);
  assert.match(css, /\.bmx-page > \.bmx-page-health \+ \*\s*\{[^}]*margin-block-start:\s*calc\(12px \* var\(--qqj-ui-scale, \.85\)\)/);
  const barCss = /\.bmx-page > \.bmx-page-health\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
  assert.match(barCss, /margin:\s*0/);
  assert.match(barCss, /font-size:\s*calc\(12px \* var\(--qqj-ui-scale, \.85\)\)/);
  assert.match(barCss, /line-height:\s*1\.55/);
  assert.match(barCss, /--bmx-health-state:\s*var\(--bmx-health-crimson\)/);
  assert.match(css, /\.bmx-page-health\.healthy\s*\{\s*--bmx-health-state:\s*var\(--bmx-health-success\)/);
  assert.match(barCss, /background:\s*color-mix\(in srgb, var\(--bmx-health-state\) 10%, var\(--bmx-health-panel\)\)/);
  assert.match(barCss, /color:\s*var\(--bmx-health-soft\)/);
  assert.doesNotMatch(glass, /\.bmx-page-health/);
  assert.doesNotMatch(records, /\.bmx-taste-page \.bmx-page-health\s*\{/);
});

test('smell uses the same single health strip in the actual four-page layout', async t => {
  const { default: FourSenses } = await import('./FourSenses.vue');
  const { reactive } = await import('vue');
  const memory = createMemoryHost();
  t.after(() => memory.cleanup());
  const state = reactive({
    source: { status: 'loading', message: '正在读取人物资料。' }, error: '', busy: false,
    world: { people: [], activities: [], events: [], atmospheres: [], knowledge: [] },
  });
  const { container } = await memory.mount(FourSenses, { state, page: 'smell' });
  const pages = ['sight', 'hearing', 'smell', 'taste'].map(page => container.querySelector('[aria-labelledby="bmx-tab-' + page + '"]'));
  assert.ok(pages.every(page => page.querySelectorAll('.bmx-page-health').length === 1));
  const smell = pages[2];
  const health = smell.querySelector('.bmx-page-health');
  assert.equal(health.textContent, '正在读取人物资料。');
  assert.equal(smell.querySelectorAll('.bmx-smell-folder').length, 6);
  assert.equal(smell.querySelector('h2'), null);
  assert.equal(container.querySelectorAll('.bmx-empty-state').filter(node => !node.closest('.bmx-page')).length, 0);
  state.source.status = 'error';
  state.source.message = '读取人物资料失败。';
  await settle();
  assert.deepEqual(smell.querySelectorAll('[role=alert]').map(node => node.textContent), ['读取人物资料失败。']);
  assert.equal(container.querySelector('.bmx-records-notice'), null);
});
