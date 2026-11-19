import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Use the CSS parser already supplied by Vite to read the production stylesheet.
const { parse } = createRequire(import.meta.resolve('vite'))('postcss');
const sheet = parse(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));
const scroller = '.bmx-shell-content';
const thumb = scroller + '::-webkit-scrollbar-thumb';

// The listed selectors are ordered by increasing specificity for this element/state.
function cascade(selectors, webKit = false) {
  const entries = new Map();
  sheet.walkRules(rule => {
    const condition = rule.parent;
    if (condition.type !== 'root' &&
        !(webKit && condition.name === 'supports' && condition.params === 'selector(::-webkit-scrollbar)')) return;
    const specificity = Math.max(...rule.selectors.map(selector => selectors.indexOf(selector)));
    if (specificity < 0) return;
    rule.walkDecls(({ prop, value, important }) => {
      const weight = specificity + (important ? selectors.length : 0);
      if (prop === 'background' && (entries.get('background-clip')?.weight ?? -1) <= weight) {
        entries.set('background-clip', { value: 'border-box', weight });
      }
      if ((entries.get(prop)?.weight ?? -1) <= weight) entries.set(prop, { value, weight });
    });
  });
  return Object.fromEntries([...entries].map(([prop, { value }]) => [prop, value]));
}

test('the main scroller uses the native thin fallback and hands both states to WebKit when supported', () => {
  for (const [hover, color] of [[false, '--bmx-scroll-thumb'], [true, '--bmx-scroll-thumb-hover']]) {
    const selectors = hover ? [scroller, scroller + ':hover'] : [scroller];
    const custom = cascade(selectors, true);
    assert.equal(custom['scrollbar-width'], 'auto');
    assert.equal(custom['scrollbar-color'], 'auto');
    const fallback = cascade(selectors);
    assert.equal(fallback['scrollbar-width'], 'thin');
    assert.equal(fallback['scrollbar-color'], `var(${color}) transparent`);
  }
  const day = cascade([scroller]);
  const night = cascade([scroller, ':host([data-bmx-theme="night"]) ' + scroller]);
  assert.deepEqual([day['--bmx-scroll-thumb'], day['--bmx-scroll-thumb-hover']], ['rgba(99,112,119,.32)', 'rgba(99,112,119,.52)']);
  assert.deepEqual([night['--bmx-scroll-thumb'], night['--bmx-scroll-thumb-hover']], ['rgba(157,176,181,.3)', 'rgba(157,176,181,.5)']);
});

test('the painted thumb has a three-pixel core on a transparent five-pixel rail', () => {
  const rail = cascade([scroller + '::-webkit-scrollbar'], true);
  assert.deepEqual([rail.width, rail.height, rail.background], ['5px', '5px', 'transparent']);
  for (const part of ['track', 'corner']) {
    assert.equal(cascade([scroller + '::-webkit-scrollbar-' + part], true).background, 'transparent');
  }
  const normal = cascade([thumb], true), hover = cascade([thumb, thumb + ':hover'], true);
  for (const [state, background] of [[normal, 'var(--bmx-scroll-thumb)'], [hover, 'var(--bmx-scroll-thumb-hover)']]) {
    assert.deepEqual([state.border, state['border-radius'], state['min-height']], ['1px solid transparent', '999px', '24px']);
    assert.equal(state.background, background);
    assert.equal(state['background-clip'], 'padding-box');
  }
  for (const button of ['', ':single-button', ':double-button', ':horizontal', ':vertical', ':start', ':end']) {
    const { display, width, height } = cascade([scroller + '::-webkit-scrollbar-button' + button], true);
    assert.deepEqual([display, width, height], ['none', '0', '0']);
  }
});
