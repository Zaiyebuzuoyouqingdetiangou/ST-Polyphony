<script setup lang="ts">
import { ref, watch } from 'vue';
import InlineSelect from './InlineSelect.vue';
import type { AppearancePreferences, AppearanceThemeMode } from '../host/appearance-settings';

const props = defineProps<{ preferences: AppearancePreferences; save(patch: Partial<AppearancePreferences>): void }>();
const themes = [{ value: 'auto', label: '跟随酒馆' }, { value: 'day', label: '日间' }, { value: 'night', label: '夜间' }];
const scale = ref(props.preferences.appearanceScale);
const url = ref(props.preferences.appearanceFontCssUrl);
const error = ref('');

watch(() => props.preferences.appearanceScale, value => { scale.value = value; });
watch(() => props.preferences.appearanceFontCssUrl, value => { url.value = value; });

function save(patch: Partial<AppearancePreferences>) {
  try {
    props.save(patch);
    error.value = '';
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存外观设置失败。';
    scale.value = props.preferences.appearanceScale;
  }
}
</script>

<template>
  <div class="appearance-settings">
    <div class="settings-field">
      <span>主题</span>
      <InlineSelect ariaLabel="主题" :options="themes" :model-value="preferences.appearanceTheme" @update:model-value="save({ appearanceTheme: $event as AppearanceThemeMode })" />
    </div>
    <label class="settings-field">
      <span>界面缩放</span>
      <div class="settings-scale">
        <input class="settings-input" type="range" min="0.75" max="1.5" step="0.05" :value="scale" @input="scale = Number(($event.target as HTMLInputElement).value)" @change="save({ appearanceScale: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ Math.round(scale * 100) }}%</output>
      </div>
    </label>
    <label class="settings-field">
      <span>自定义字体 CSS URL</span>
      <input class="settings-input" type="text" placeholder="https://…/font.css" :value="url" @change="url = ($event.target as HTMLInputElement).value; save({ appearanceFontCssUrl: url })" />
    </label>
    <p v-if="error" class="settings-result error" role="alert">{{ error }}</p>
  </div>
</template>
