<script setup lang="ts">
import {computed,ref,nextTick,onMounted,onBeforeUnmount,watch} from 'vue';
import {createPanelGeometryController,type PanelGeometryController} from './panel-geometry.js';
import {bindPanelInteractions} from './panel-interactions.js';
import type {AppearanceThemeMode} from '../host/appearance-settings';
import OrganIcon from './OrganIcon.vue';
import {createBlueGlassTexture,type InterferenceColors} from './blue-glass';
import {FAB_HOST_ID} from './fab';
const props=defineProps<{visible:boolean;page:string;themeMode?:AppearanceThemeMode;fabShown:boolean;textureColors?:InterferenceColors;smellOpen?:boolean}>();
const tabs=[{id:'sight',label:'视',icon:'view'},{id:'hearing',label:'听',icon:'ear'},{id:'smell',label:'嗅',icon:'nose'},{id:'taste',label:'味',icon:'tongue'},{id:'settings',label:'设置',icon:'settings-02'}] as const;
const emit=defineEmits<{close:[restoreFocus?:boolean];navigate:[page:string];escape:[];theme:[];fab:[]}>();
const content=ref<HTMLElement>(),stage=ref<HTMLElement>(),panel=ref<HTMLElement>(),header=ref<HTMLElement>(),resizeHandle=ref<HTMLButtonElement>();
const texture=ref('');
let textureKey:string|undefined;
let geometry:PanelGeometryController|undefined;
let interactions:ReturnType<typeof bindPanelInteractions>|undefined;
const focusClose=()=>panel.value?.querySelector<HTMLButtonElement>('[aria-label="关闭百面相"]')?.focus({preventScroll:true});
watch(()=>props.visible?(props.textureColors?.flat().join(',')??'default'):undefined,key=>{
 if(key===undefined||key===textureKey)return;
 texture.value=createBlueGlassTexture(props.textureColors);
 textureKey=key;
},{immediate:true,flush:'post'});
onMounted(()=>{
 if(panel.value&&header.value&&resizeHandle.value){
  geometry=createPanelGeometryController({panel:panel.value,dragHandle:header.value,resizeHandle:resizeHandle.value,viewport:window});
  const root=panel.value.getRootNode() as ShadowRoot;
  interactions=bindPanelInteractions({panel:panel.value,isOpen:()=>props.visible,isTrigger:event=>event.composedPath().some(node=>['dollars-world-open', FAB_HOST_ID].includes((node as HTMLElement).id)),hasDialog:()=>Boolean(root.querySelector('.bmx-api-dialog-overlay')||root.querySelector('#qqj-dialog-host')?.shadowRoot?.querySelector('#sp-addon-dialog')),close:restoreFocus=>emit('close',restoreFocus),escape:()=>emit('escape')});
 }
 if(props.visible)focusClose();
});
watch(()=>props.visible,visible=>{interactions?.reset();if(visible){geometry?.restore();focusClose();}else geometry?.cancelGesture();},{flush:'post'});
onBeforeUnmount(()=>{interactions?.destroy();geometry?.destroy();texture.value='';});
const themeLabel=computed(()=>({auto:'跟随酒馆',day:'日间',night:'夜间'}[props.themeMode??'auto']));
const themeSvg=computed(()=>props.themeMode==='day'?'<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M5.64 5.64l1.42 1.42M16.94 16.94l1.42 1.42M3 12h2M19 12h2M5.64 18.36l1.42-1.42M16.94 7.06l1.42-1.42"></path>':props.themeMode==='night'?'<path d="M21 15.5A9 9 0 0 1 8.5 3 9 9 0 1 0 21 15.5Z"></path>':'<path d="M12 3a9 9 0 1 0 0 18V3Z"></path><circle cx="12" cy="12" r="9"></circle>');
async function navigate(page:string){emit('navigate',page);await nextTick();if(content.value)content.value.scrollTop=0;}
function onKeydown(event:KeyboardEvent){const target=event.target;const editing=target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));if(editing&&event.key!=='Escape')event.stopPropagation();}
</script>
<template>
 <div class="bmx-overlay" :class="{'is-visible':visible}" :aria-hidden="!visible" @keydown="onKeydown">
  <section ref="panel" class="bmx-window bmx-blue-glass" :style="{'--bmx-window-texture':texture?`url(${texture})`:'none'}" role="dialog" aria-label="百面相">
   <header ref="header" class="bmx-header" :inert="smellOpen"><div class="bmx-brand"><h1>百面相</h1><span>Polyphony</span></div><div class="bmx-header-actions"><button class="bmx-icon-button" type="button" :aria-label="'主题：'+themeLabel" :title="'主题：'+themeLabel" @click="emit('theme')"><svg viewBox="0 0 24 24" aria-hidden="true" v-html="themeSvg"></svg></button><button class="bmx-icon-button bmx-fab-toggle" type="button" :aria-label="fabShown?'隐藏悬浮球':'显示悬浮球'" :title="fabShown?'悬浮球：显示':'悬浮球：隐藏'" :aria-pressed="fabShown" @click="emit('fab')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.7"/></svg></button><button class="bmx-icon-button" type="button" aria-label="关闭百面相" title="关闭" @click="emit('close')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 3.5l17 17M20.5 3.5l-17 17"/></svg></button></div></header>
   <div ref="stage" class="bmx-content-stage" :inert="smellOpen"><div ref="content" class="bmx-shell-content"><slot :stage="stage" :panel="panel"></slot></div></div>
   <nav class="bmx-bottom" role="tablist" aria-label="百面相模块" :inert="smellOpen"><button v-for="tab in tabs" :key="tab.id" type="button" class="bmx-tab" :id="'bmx-tab-'+tab.id" role="tab" :aria-selected="page===tab.id" @click="navigate(tab.id)"><OrganIcon :name="tab.icon"/><span>{{ tab.label }}</span></button></nav>
   <button ref="resizeHandle" class="bmx-panel-resize-handle" :inert="smellOpen" type="button" aria-label="调整百面相面板大小" title="拖动调整面板大小"><span class="bmx-resize-grip" aria-hidden="true"></span></button>
  </section>
 </div>
</template>
