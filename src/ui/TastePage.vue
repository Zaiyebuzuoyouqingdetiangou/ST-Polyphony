<script setup lang="ts">
import {computed,ref,shallowRef,watch,nextTick} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {TasteCircle,TasteCircleEdit} from '../domain/social-circles';
import type {DevelopmentView} from '../application/development';
import SmileAvatar from './SmileAvatar.vue';
import PlasmaLandscape from './PlasmaLandscape.vue';
import ModuleHealth from './ModuleHealth.vue';
import MoodOverview from './MoodOverview.vue';
import ApiPresetDialog from './ApiPresetDialog.vue';
const props=defineProps<{state:ControllerState;development?:DevelopmentView;circles:TasteCircle[];stage?:HTMLElement;active?:boolean;editCircle?:(edit:TasteCircleEdit)=>Promise<void>}>();
const emit=defineEmits<{person:[id:string]}>();
const root=ref<HTMLElement>(),menuBody=ref<HTMLElement>();
const menu=shallowRef<{circle:TasteCircle;trigger:HTMLButtonElement}>();
const overviews=new Map<string,InstanceType<typeof MoodOverview>>();
const members=(ids:string[])=>props.state.world.people.filter(p=>ids.includes(p.id));
const editor=ref<{kind:'update'|'delete';scopeId:string;circle:TasteCircle;title:string;personIds:string[];search:string;error:string;saving:boolean}>();
const editorPeople=computed(()=>{
 const query=editor.value?.search.trim().toLocaleLowerCase();
 const existing=new Set(editor.value?.circle.personIds??[]);
 return props.state.world.people.filter(person=>!query||[person.name,...(person.aliases??[])].some(name=>name.toLocaleLowerCase().includes(query)))
  .sort((a,b)=>Number(existing.has(b.id))-Number(existing.has(a.id)));
});
let editTrigger:HTMLButtonElement|undefined;
function closeMenu(restore=false){
 const trigger=menu.value?.trigger;
 menu.value=undefined;
 if(restore)trigger?.focus({preventScroll:true});
}
function toggleMenu(circle:TasteCircle,event:MouseEvent|KeyboardEvent){
 if(menu.value?.circle.id===circle.id){if(event.type==='click')closeMenu(true);return;}
 menu.value={circle,trigger:event.currentTarget as HTMLButtonElement};
}
watch(menu,(open,_previous,onCleanup)=>{
 const body=menuBody.value,stage=props.stage,scroll=root.value?.closest('.bmx-shell-content');
 if(!open||!body||!stage||!scroll)return;
 const {trigger}=open,document=trigger.ownerDocument;
 const position=()=>{
  const anchor=trigger.getBoundingClientRect(),bounds=stage.getBoundingClientRect();
  const gap=4,height=body.offsetHeight;
  const below=anchor.bottom-bounds.top+gap;
  const top=below+height<=bounds.height?below:anchor.top-bounds.top-height-gap;
  body.style.top=Math.max(gap,top)+'px';
  body.style.right=Math.max(gap,bounds.right-anchor.right)+'px';
 };
 position();
 body.querySelector('button')?.focus({preventScroll:true});
 const dismiss=(event:MouseEvent)=>{
  const path=event.composedPath();
  if(menu.value===open&&!path.includes(trigger)&&!path.includes(body))closeMenu();
 };
 const onScroll=()=>{if(menu.value===open)closeMenu();};
 const observer=new ResizeObserver(position);
 observer.observe(stage);
 document.addEventListener('click',dismiss);
 scroll.addEventListener('scroll',onScroll);
 onCleanup(()=>{
  observer.disconnect();
  document.removeEventListener('click',dismiss);
  scroll.removeEventListener('scroll',onScroll);
 });
},{flush:'post'});
function menuKeydown(event:KeyboardEvent){
 if(event.isComposing)return;
 if(event.key==='Tab'){closeMenu(true);return;}
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);return;}
 const choices=Array.from(menuBody.value?.querySelectorAll('button')??[]);
 const at=choices.indexOf(event.target as HTMLButtonElement);
 const target=event.key==='Home'?choices[0]:event.key==='End'?choices.at(-1):
  event.key==='ArrowDown'||event.key==='ArrowUp'?choices[(at+1)%choices.length]:undefined;
 if(target){event.preventDefault();target.focus({preventScroll:true});}
}
function closeEditor(restore=false){
 editor.value=undefined;
 const trigger=editTrigger;editTrigger=undefined;
 if(restore)void nextTick(()=>{if(props.active!==false)trigger?.focus({preventScroll:true});});
}
function openEditor(kind:'update'|'delete'){
 const open=menu.value,scopeId=props.state.world.id;
 if(!open||!scopeId||!props.editCircle)return;
 const circle=props.circles.find(circle=>circle.id===open.circle.id);
 if(!circle){closeMenu(true);return;}
 editTrigger=open.trigger;
 closeMenu();
 editor.value={kind,scopeId,circle,title:circle.title,personIds:[...circle.personIds],search:'',error:'',saving:false};
}
async function saveEditor(){
 const edit=editor.value,save=props.editCircle;
 if(!edit||!save||edit.saving)return;
 const base={scopeId:edit.scopeId,circleId:edit.circle.id};
 const samePeople=edit.personIds.length===edit.circle.personIds.length&&edit.personIds.every(id=>edit.circle.personIds.includes(id));
 const change:TasteCircleEdit=edit.kind==='delete'?{...base,kind:'delete'}:{
  ...base,kind:'update',...(edit.title.trim()!==edit.circle.title?{title:edit.title}:{}),...(!samePeople?{personIds:edit.personIds}:{}),
 };
 edit.saving=true;edit.error='';
 try{
  await save(change);
  if(editor.value===edit)closeEditor(true);
 }catch(error){
  if(editor.value===edit)edit.error=error instanceof Error?error.message:'圈子保存失败。';
 }finally{if(editor.value===edit)edit.saving=false;}
}
watch([()=>props.state.world.id,()=>props.active],()=>{closeMenu();closeEditor();});
function setOverview(id:string,overview:unknown){if(overview)overviews.set(id,overview as InstanceType<typeof MoodOverview>);else overviews.delete(id);}
async function focusMood(id:string){await nextTick();overviews.get(id)?.expand();await nextTick();const target=root.value?.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(id)}"]`),scroll=root.value?.closest('.bmx-shell-content');if(target&&scroll)scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top;}
defineExpose({focusMood});
</script>
<template>
 <section ref="root" class="bmx-page bmx-taste-page" role="tabpanel" aria-labelledby="bmx-tab-taste">
  <ModuleHealth :state="state" :development="development" ready-label="社交圈已载入"/>
  <article v-for="(mood,index) in circles" :key="mood.id" class="bmx-mood-entry" :data-result-id="mood.id">
   <div class="bmx-mood-heading">
    <h3 class="bmx-record-title bmx-mood-title">
     <PlasmaLandscape :circle-id="mood.id" :visual="mood.visual" :emotion-values="mood.emotionValues"/>
     <span class="bmx-mood-title-text">{{ mood.title }}</span>
    </h3>
    <button v-if="editCircle&&stage" type="button" class="bmx-mood-edit-toggle" :aria-label="mood.title+'更多操作'"
     aria-haspopup="menu" :aria-expanded="menu?.circle.id===mood.id" :aria-controls="menu?.circle.id===mood.id?'bmx-circle-menu':undefined"
     @click="toggleMenu(mood,$event)" @keydown.arrow-down.prevent="toggleMenu(mood,$event)">⋮</button>
   </div>
   <MoodOverview :ref="overview=>setOverview(mood.id,overview)" :text="mood.description" :overview-id="'bmx-mood-overview-'+index"/>
   <div class="bmx-participants"><button v-for="p in members(mood.personIds)" :key="p.id" type="button" class="bmx-participant" @click="emit('person',p.id)"><SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="28"/><span>{{ p.name }}</span></button></div>
  </article>
  <p v-if="!circles.length" class="bmx-empty-state">暂无已整理的社交圈。</p>
  <Teleport v-if="stage&&menu" :to="stage">
   <div id="bmx-circle-menu" ref="menuBody" class="bmx-circle-menu" role="menu" :aria-label="menu.circle.title+'更多操作'" @keydown="menuKeydown">
    <button type="button" role="menuitem" tabindex="-1" @click="openEditor('update')">编辑</button>
    <button type="button" role="menuitem" tabindex="-1" class="bmx-circle-delete" @click="openEditor('delete')">删除</button>
   </div>
  </Teleport>
  <ApiPresetDialog v-if="editor" :key="editor.kind" :editor="editor.kind==='update'"
   :title="editor.kind==='update'?'编辑圈子 · '+editor.circle.title:'删除圈子'"
   :body="''" :busy="editor.saving" :confirm-text="editor.kind==='update'?'保存':'删除'" @cancel="closeEditor(true)" @confirm="saveEditor">
   <div v-if="editor.kind==='update'" class="bmx-api-config-fields">
    <label class="bmx-api-field">圈名<input v-model="editor.title" class="bmx-api-input" type="text" :disabled="editor.saving" autocomplete="off" required/></label>
    <fieldset class="bmx-circle-member-field" :disabled="editor.saving">
     <legend>成员</legend>
     <input v-if="state.world.people.length>8" v-model="editor.search" class="bmx-api-input" type="search" aria-label="搜索人物" placeholder="搜索人物" @keydown.enter.stop/>
     <div class="bmx-circle-member-options">
      <label v-for="person in editorPeople" :key="person.id">
       <input v-model="editor.personIds" type="checkbox" :value="person.id"/><span>{{ person.name }}</span>
      </label>
      <p v-if="!editorPeople.length">暂无匹配的人物。</p>
     </div>
    </fieldset>
   </div>
   <p v-else class="bmx-circle-delete-copy">将「{{ editor.circle.title }}」从味移除？</p>
   <p v-if="editor.error" class="bmx-api-result error bmx-circle-edit-error" role="alert">{{ editor.error }}</p>
  </ApiPresetDialog>
 </section>
</template>
