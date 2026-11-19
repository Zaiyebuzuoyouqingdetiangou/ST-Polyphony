import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import '../../scripts/source-loader.mjs';

const { applyAppearance } = await import('./appearance.ts');
const fabPresentation = await import('./fab-presentation.ts');
const { bindDialogViewport } = await import('./dialog-layout.js');

function appearance(mode, signals = {}) {
  const variables = new Map();
  const attributes = new Map();
  const host = { style: { setProperty: (key, value) => variables.set(key, value) }, setAttribute: (key, value) => attributes.set(key, value) };
  const documentRef = { documentElement: {} };
  const windowRef = {
    getComputedStyle: () => ({ getPropertyValue: name => signals[name.replace('--SmartTheme', '')] ?? '' }),
    matchMedia: () => ({ matches: true }),
  };
  return { value: applyAppearance(host, mode, documentRef, windowRef), variables, attributes };
}

const rgb = css => css.startsWith('#')
  ? css.slice(1).match(/../g).map(channel => parseInt(channel, 16))
  : css.match(/\d+/g).map(Number);
function luminance(channels) {
  return channels.reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
  }, 0);
}
function contrast(a, b) {
  const light = luminance(a), dark = luminance(b);
  return (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
}

test('approved fixed day and night textures reach the same shell and dialog entry', () => {
  const day = appearance('day', { BodyColor: '#ffffff', QuoteColor: '#cc3344' });
  const night = appearance('night', { BodyColor: '#222222', QuoteColor: '#cc3344' });
  assert.deepEqual(day.value.glass.textureColors, [[177, 209, 234], [236, 193, 150]]);
  assert.deepEqual(night.value.glass.textureColors, [[34, 78, 132], [28, 113, 105]]);
  assert.equal(night.variables.get('--bmx-glass-wash'), 'rgb(13 21 28 / .16)');
  for (const current of [day, night]) {
    assert.equal(current.variables.get('--bmx-api-panel'), current.value.glass.dialog.panel);
    assert.equal(current.variables.get('--bmx-api-knot'), current.value.glass.dialog.knot);
  }
});

test('glass staggers each glow without shearing its rows and keeps the native image if readback is blocked', async t => {
  const { createBlueGlassTexture } = await import('./blue-glass.ts');
  const saved = { window: globalThis.window, document: globalThis.document };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const sha = pixels => createHash('sha256').update(pixels).digest('hex');
  let canvases = 0, reads = 0, writes = 0, blocked = false, nativeImage, correctedImage;
  globalThis.window = {};
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      canvases++;
      let pixels;
      const context = {
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData(frame, x, y) {
          assert.deepEqual([x, y], [0, 0]);
          pixels = frame.data.slice();
          if (!writes || blocked) nativeImage = pixels;
          else correctedImage = pixels;
          writes++;
        },
        getImageData(x, y, width, height) {
          assert.deepEqual([x, y, width, height], [0, 0, 384, 384]);
          reads++;
          if (blocked) throw Error('canvas readback blocked');
          return { data: pixels.slice() };
        },
      };
      return { getContext: () => context, toDataURL: () => sha(pixels) };
    },
  };
  const day = appearance('day').value.glass.textureColors;
  const texture = createBlueGlassTexture(day);
  const band = (pixels, row, left) => pixels.subarray((row * 384 + left) * 4, (row * 384 + left + 180) * 4);
  for (const row of [122, 162, 202, 230]) assert.deepEqual(band(correctedImage, row, 98), band(nativeImage, row, 142));
  for (const row of [266, 292, 318, 351]) assert.deepEqual(band(correctedImage, row, 98), band(nativeImage, row, 103));
  assert.notEqual(texture, sha(nativeImage));
  assert.equal(createBlueGlassTexture(day), texture);
  assert.deepEqual([canvases, reads, writes], [1, 1, 2]);
  blocked = true;
  const fallback = createBlueGlassTexture([[21, 30, 50], [31, 60, 83]]);
  assert.equal(fallback, sha(nativeImage));
  assert.deepEqual([canvases, reads, writes], [2, 2, 3]);
});

test('follow mode uses the readable QQJ paper and quote, and keeps history legible on the raw islands', () => {
  const samples = [
    { BodyColor: '#24292d', QuoteColor: '#002fa7', ChatTintColor: '#fafafa', BotMesBlurTintColor: '#fafafa' },
    { BodyColor: '#fafafa', QuoteColor: '#efbd50', ChatTintColor: '#171d26', BotMesBlurTintColor: '#212a38' },
    { BodyColor: '#212b20', QuoteColor: '#7b3262', ChatTintColor: '#ddf4ec', BotMesBlurTintColor: '#e5eee4' },
  ];
  for (const sample of samples) {
    const { value, variables, attributes } = appearance('auto', sample);
    assert.equal(attributes.get('data-bmx-theme-mode'), 'auto');
    assert.equal(attributes.get('data-bmx-theme'), value.effectiveTheme);
    assert.equal(variables.get('--bmx-api-panel'), value.apiPalette.panel);
    assert.equal(variables.get('--bmx-api-knot'), value.apiPalette.knot);
    const wash = value.effectiveTheme === 'day' ? [255, 255, 255, .11] : [13, 21, 28, .16];
    for (const color of value.glass.textureColors) {
      const coated = color.map((channel, i) => channel * (1 - wash[3]) + wash[i] * wash[3]);
      for (const token of ['--bmx-glass-ink', '--bmx-glass-faint']) {
        assert.ok(contrast(coated, rgb(variables.get(token))) >= 4.5, token);
      }
    }
  }
  const { value } = appearance('auto', samples[0]);
  assert.deepEqual(value.glass.textureColors[0], [250, 250, 250]);
  assert.ok(value.glass.textureColors[1].every((channel, index) => Math.abs(channel - [101, 132, 201][index]) <= 4));
});

test('FAB starts 10px to the left of QQJ at its desktop and mobile height', () => {
  assert.deepEqual(fabPresentation.defaultFabPosition({width: 1000, height: 800, mobile: false, size: 36}), { x: 858, y: 676 });
  assert.deepEqual(fabPresentation.defaultFabPosition({width: 390, height: 844, mobile: true, size: 36}), { x: 250, y: 700 });
});

test('both kinds of plugin dialog stack above the FAB until their last overlay closes', () => {
  const attrs = new Map();
  const host = { id: 'dollars-world-host', setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener() {}, removeEventListener() {} };
  const dialog = () => ({ getRootNode: () => ({ host }), getBoundingClientRect: () => ({ left: 0, top: 0 }), style: {} });
  const closeApi = bindDialogViewport(dialog(), window);
  const closeNative = bindDialogViewport(dialog(), window);
  assert.ok(attrs.has('data-bmx-dialog-open'));
  closeApi();
  assert.ok(attrs.has('data-bmx-dialog-open'));
  closeNative();
  assert.equal(attrs.has('data-bmx-dialog-open'), false);
});

test('title hierarchy uses the QQJ tokens at 85 percent and inherits the custom family', async () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.bmx-brand h1\{[^}]*font-size:calc\(22px \* var\(--qqj-ui-scale,\s*\.85\)\)/);
  assert.match(css, /\.bmx-brand>span\{[^}]*font-size:var\(--qqj-font-meta\)/);
  assert.match(css, /--qqj-font-title:\s*calc\(24px \* var\(--qqj-ui-scale,\s*\.85\)\)/);
  assert.match(css, /--qqj-font-heading:\s*calc\(18px \* var\(--qqj-ui-scale,\s*\.85\)\)/);
  assert.match(css, /--qqj-font-meta:\s*calc\(11px \* var\(--qqj-ui-scale,\s*\.85\)\)/);
  assert.match(css, /:host\s*\{[^}]*font-family:\s*var\(--qqj-custom-font, system-ui\)/);
});

test('the past text is quieter and stays readable across the actual day, night and follow textures', async () => {
  const { generateAvatar } = await import('../vendor/avatar-generator/src/themes/interference/index.ts');
  const modes = [
    ['day'], ['night'],
    ['auto', { BodyColor: '#24292d', QuoteColor: '#002fa7', ChatTintColor: '#fafafa' }],
    ['auto', { BodyColor: '#fafafa', QuoteColor: '#efbd50', ChatTintColor: '#171d26' }],
    ['auto', { BodyColor: '#222222', QuoteColor: '#101c66', ChatTintColor: '#cfe4ba', BotMesBlurTintColor: '#dad4a1' }],
  ];
  for (const [mode, signals] of modes) {
    const { value, variables } = appearance(mode, signals);
    const current = rgb(variables.get('--bmx-glass-ink'));
    const pastToken = variables.get('--bmx-hearing-past');
    assert.ok(pastToken, mode + ' has a dedicated past ink');
    const past = rgb(pastToken);
    const dark = value.effectiveTheme === 'night';
    const wash = dark ? [13, 21, 28, .16] : [255, 255, 255, .11];
    let pixels;
    const context = {
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData(image) { pixels = image.data; },
    };
    generateAvatar({ id: '6', size: 384, foreground: value.glass.textureColors, interpolate: false, canvas: { getContext: () => context } });
    let minimum = Infinity;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const base = pixels.subarray(offset, offset + 3);
      // Same slight saturation and wash as the glass above the generated texture.
      const grey = .213 * base[0] + .715 * base[1] + .072 * base[2];
      const surface = Array.from(base, (value, channel) =>
        Math.max(0, Math.min(255, grey + (value - grey) * 1.04)) * (1 - wash[3]) + wash[channel] * wash[3],
      );
      const ratio = contrast(surface, past);
      minimum = Math.min(minimum, ratio);
      assert.ok(ratio < contrast(surface, current), mode);
    }
    assert.ok(minimum >= 4.5, mode + ' ' + minimum);
  }
});

test('hearing status pills use legible and distinct colour pairs in both effective themes', () => {
  const styles = readFileSync(new URL('./record-pages.css', import.meta.url), 'utf8');
  const pairRule = /(:host\(\[data-bmx-theme="night"\]\) )?\.bmx-hearing-footer \.bmx-task-status\[data-status=(\w+)\]\s*\{\s*color:\s*(#[a-f\d]{6});\s*background:\s*(#[a-f\d]{6});?\s*\}/gi;
  const groups = { day: new Map(), night: new Map() };
  for (const [, night, status, ink, fill] of styles.matchAll(pairRule)) groups[night ? 'night' : 'day'].set(status, [ink, fill]);
  for (const [theme, pairs] of Object.entries(groups)) {
    assert.deepEqual([...pairs.keys()], ['planned', 'active', 'waiting', 'completed'], theme);
    assert.equal(new Set([...pairs.values()].map(([, fill]) => fill)).size, 4, theme);
    for (const [status, [ink, fill]] of pairs) assert.ok(contrast(rgb(ink), rgb(fill)) >= 4.5, theme + ' ' + status);
  }
});
