<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { bindDialogViewport, createDialogBackdropHandlers } from './dialog-layout.js';

// QQJ current custom-dialog geometry; the model editor retains draft and persistence ownership.
const props = defineProps<{ title: string; body: string; note?: string; prompt?: boolean; initialValue?: string; confirmText: string; editor?: boolean; busy?: boolean }>();
const emit = defineEmits<{ confirm: [value: string]; cancel: [] }>();
const value = ref(props.initialValue ?? '');
const error = ref('');
const anchor = ref<HTMLElement | null>(null), overlay = ref<HTMLElement | null>(null), portal = ref<HTMLElement | null>(null);
let stopViewport = () => {};
const backdrop = createDialogBackdropHandlers(() => { if (!props.busy) emit('cancel'); });
const input = ref<HTMLInputElement | null>(null);
const submitButton = ref<HTMLButtonElement | null>(null);
function submit() {
  if (props.busy) return;
  if (props.prompt && !value.value.trim()) { error.value = '请输入预设名称。'; input.value?.focus(); return; }
  emit('confirm', value.value.trim());
}
function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Tab') {
    const controls = [...(submitButton.value?.closest('[role=dialog]')?.querySelectorAll<HTMLElement>('button,summary,input,textarea,select,a[href]') ?? [])].filter(node => !node.hasAttribute('disabled') && node.getClientRects().length);
    const active = (submitButton.value?.getRootNode() as ShadowRoot)?.activeElement;
    const at = controls.indexOf(active as HTMLElement); event.preventDefault(); controls[(at + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus(); return;
  }
  if (props.busy) return;
  if (event.key === 'Escape') { event.preventDefault(); emit('cancel'); }
  else if (event.key === 'Enter' && (event.target === input.value || (props.editor && event.target instanceof HTMLInputElement))) { event.preventDefault(); submit(); }
}
onMounted(async () => {
  const layer = document.createElement('div');
  layer.className = 'bmx-api-dialog-layer';
  anchor.value?.getRootNode().appendChild(layer);
  portal.value = layer;
  await nextTick();
  if (overlay.value) stopViewport = bindDialogViewport(overlay.value, window);
  if (props.prompt) { input.value?.focus(); input.value?.select(); } else submitButton.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => { stopViewport(); portal.value?.remove(); });
</script>

<template>
  <span ref="anchor" hidden></span>
  <Teleport :to="portal || 'body'" :disabled="!portal">
  <div ref="overlay" class="bmx-api-dialog-overlay" :class="{ 'is-editor': editor }" v-on="backdrop" @keydown="onKeydown">
    <div class="bmx-api-dialog-sheet" :class="{ 'bmx-api-config-dialog': editor }" role="dialog" aria-modal="true" aria-labelledby="bmx-api-dialog-title">
      <div id="bmx-api-dialog-title" class="bmx-api-dialog-head">{{ title }}</div>
      <div class="bmx-api-dialog-body"><slot>{{ body }}</slot></div>
      <div v-if="note" class="bmx-api-dialog-note">{{ note }}</div>
      <input v-if="prompt" ref="input" v-model="value" class="bmx-api-dialog-input" type="text" placeholder="预设名称" aria-label="预设名称" maxlength="40" autocomplete="off" @input="error = ''">
      <div v-if="prompt" class="bmx-api-dialog-input-error" aria-live="polite">{{ error }}</div>
      <div class="bmx-api-dialog-actions">
        <button type="button" class="bmx-api-dialog-button bmx-api-dialog-button-secondary" :disabled="busy" @click="emit('cancel')">取消</button>
        <button ref="submitButton" type="button" class="bmx-api-dialog-button bmx-api-dialog-button-primary" :disabled="busy" @click="submit">{{ confirmText }}</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>
