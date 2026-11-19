import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { gouhuaDialogCss } from './qqj/gouhua-dialog-style.js';

const { parse } = createRequire(import.meta.resolve('vite'))('postcss');
const css = file => parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const shell = css('../styles.css'), settings = css('./qqj-settings.css'), api = css('./api-settings.css');
const prompt = parse(gouhuaDialogCss);
const read = (sheet, selector) => {
  const declarations = {};
  sheet.walkRules(rule => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls(({ prop, value }) => { declarations[prop] = value.trim(); });
    }
  });
  return declarations;
};

test('settings and drawers use the QQJ spacing base without squeezing the enabled label', () => {
  const page = read(shell, '.bmx-settings-page');
  assert.equal(page.padding, 'calc(12px * var(--qqj-ui-scale, .85)) calc(17px * var(--qqj-ui-scale, .85)) calc(20px * var(--qqj-ui-scale, .85))');
  assert.equal(page.gap, 'calc(10px * var(--qqj-ui-scale, .85))');
  const sub = read(settings, '.bmx-settings-page .settings-sub>.settings-sub-summary');
  assert.equal(sub['min-height'], 'var(--qqj-control-height)');
  assert.equal(sub.padding, 'calc(8px * var(--qqj-ui-scale, .85)) calc(2px * var(--qqj-ui-scale, .85))');
  const title = read(settings, '.bmx-settings-page .settings-sub-summary h4');
  assert.equal(title['overflow-wrap'], 'anywhere');
  const master = read(settings, '.bmx-settings-page .master-switch .setting-switch');
  assert.equal(master['font-size'], 'calc(18px * var(--qqj-ui-scale,1))');
  assert.equal(master['font-weight'], '600');
});

test('settings, API and nested dialogs share scaled fields and fixed-pad buttons', () => {
  const tokens = read(settings, '#qqj-dialog-host');
  assert.equal(tokens['--qqj-font-body'], 'calc(13px * var(--qqj-ui-scale, .85))');
  assert.equal(tokens['--qqj-control-height'], 'calc(36px * var(--qqj-ui-scale, .85))');
  assert.equal(tokens['--qqj-control-line'], 'calc(20px * var(--qqj-ui-scale, .85))');
  assert.equal(tokens['--qqj-button-line'], 'calc(var(--qqj-font-body) * 20 / 13)');
  assert.equal(tokens['--qqj-button-padding'], 'calc(8px * .85 - 1px) calc(10px * .85)');
  for (const [sheet, selector] of [
    [settings, '.bmx-settings-page .bmx-development-controls button'],
    [api, '.bmx-api-editor button'],
    [api, '.bmx-api-dialog-overlay button'],
    [prompt, '.sp-dialog-button'],
  ]) {
    const button = read(sheet, selector);
    assert.equal(button.padding, 'var(--qqj-button-padding)', selector);
    assert.equal(button['line-height'], 'var(--qqj-button-line)', selector);
    assert.equal(button['min-height'], '0', selector);
  }
  const input = read(api, '.bmx-api-dialog-overlay input.bmx-api-input');
  assert.equal(input['line-height'], 'var(--qqj-control-line)');
  assert.equal(input['min-height'], 'var(--qqj-control-height)');
});

test('long setup labels and actions can wrap in narrow, enlarged settings', () => {
  const label = read(api, '.bmx-inline-select-value');
  assert.equal(label['white-space'], 'normal');
  assert.equal(label['overflow-wrap'], 'anywhere');
  const row = read(api, '.bmx-api-purpose-row');
  assert.equal(row['grid-template-columns'], 'minmax(0,1fr) auto');
  assert.equal(row['min-width'], '0');
  assert.equal(read(api, '.bmx-api-actions')['flex-wrap'], 'wrap');
});
