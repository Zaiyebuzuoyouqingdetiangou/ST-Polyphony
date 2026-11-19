import test from 'node:test';
import assert from 'node:assert/strict';
import '../../scripts/source-loader.mjs';

const { createAppearanceSettings } = await import('./appearance-settings.ts');
const { readSharedApiPresets } = await import('./api-pool.ts');
const { getHostContext } = await import('./host-context.ts');

test('theme preference defaults without writing and saves only its own namespace field', () => {
  let saves = 0;
  const context = { extensionSettings: { 'st-dollars': { existing: true }, unrelated: { intact: true } }, saveSettingsDebounced: () => saves++ };
  const settings = createAppearanceSettings(() => context);
  assert.equal(settings.get().appearanceTheme, 'auto'); assert.equal(saves, 0);
  settings.save({ appearanceTheme: 'night' });
  assert.deepEqual(context.extensionSettings['st-dollars'], { existing: true, appearanceTheme: 'night' });
  assert.deepEqual(context.extensionSettings.unrelated, { intact: true }); assert.equal(saves, 1);
});

test('shared API reader returns current id-addressed connection fields and ignores malformed entries', () => {
  const context = { extensionSettings: { 'schedule-planner': { apiPresets: [null, { name: 'no id', url: 'https://x' }, { id: 'p', name: 'Pool', url: ' https://pool/ ', key: 'secret', model: 'm' }] } } };
  assert.deepEqual(readSharedApiPresets(context), [{ id: 'p', name: 'Pool', url: 'https://pool/', key: 'secret', model: 'm' }]);
  assert.deepEqual(readSharedApiPresets({ extensionSettings: {} }), []);
});

test('theme and shared pool adapters use the existing SillyTavern and Luker context entries', () => {
  for (const hostName of ['SillyTavern', 'Luker']) {
    let saved = 0;
    const context = { extensionSettings: { 'schedule-planner': { apiPresets: [{ id: 'source', name: hostName, url: 'https://pool', key: 'private', model: 'm' }] }, 'st-dollars': {} }, saveSettingsDebounced: () => saved++ };
    const globals = { [hostName]: { getContext: () => context } };
    const resolved = getHostContext(globals);
    assert.equal(readSharedApiPresets(resolved)[0].id, 'source');
    const settings = createAppearanceSettings(() => getHostContext(globals));
    assert.equal(settings.get().appearanceTheme, 'auto'); settings.save({ appearanceTheme: 'day' });
    assert.equal(context.extensionSettings['st-dollars'].appearanceTheme, 'day'); assert.equal(saved, 1);
  }
});
