<script setup lang="ts">
import {computed,nextTick,ref,shallowRef,watch} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {DevelopmentView} from '../application/development';
import {hearingActivities} from './hearing-activities';
import {activityStatusLabel} from './current-activities';
import SmileAvatar from './SmileAvatar.vue';
import ModuleHealth from './ModuleHealth.vue';

const props=defineProps<{state:ControllerState;development?:DevelopmentView;stage?:HTMLElement;active?:boolean}>();
const emit=defineEmits<{person:[id:string]}>();
const root=ref<HTMLElement>();
const participantsPopup=ref<HTMLElement>();
const expanded=ref(new Set<string>());
const rows=computed(()=>hearingActivities(props.state.world));
const echoesOpen=ref(false);
const ended=computed(()=>rows.value.filter(row=>row.activity.status==='completed'));
const sections=computed(()=>[
 {id:'current',rows:rows.value.filter(row=>row.activity.status!=='completed')},
 ...(ended.value.length?[{id:'echoes',rows:ended.value}]:[]),
]);
const echoWave=[4,7,12,17,12,7,4];
const scrollRoot=()=>root.value?.closest<HTMLElement>('.bmx-shell-content');

const openRoster=shallowRef<{
 activityId:string;
 trigger:HTMLButtonElement;
 docked:boolean;
 style:Record<string,string>;
}|null>(null);
const rosterPeople=computed(()=>rows.value.find(row=>row.activity.id===openRoster.value?.activityId)?.people??[]);

function toggleProgress(id:string) {
 if(expanded.value.has(id))expanded.value.delete(id);
 else expanded.value.add(id);
}
async function focusActivity(id:string) {
 if(ended.value.some(row=>row.activity.id===id))echoesOpen.value=true;
 await nextTick();
 const target=root.value?.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(id)}"]`);
 const scroll=scrollRoot();
 if(target&&scroll)scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top;
}
defineExpose({focusActivity});
function toggleEchoes() {
 echoesOpen.value=!echoesOpen.value;
 if(!echoesOpen.value)void closeRoster();
}

async function closeRoster(restoreFocus=false) {
 const trigger=openRoster.value?.trigger;
 openRoster.value=null;
 if(restoreFocus&&trigger){
  await nextTick();
  if(props.active!==false&&!openRoster.value)trigger.focus({preventScroll:true});
 }
}
function toggleRoster(activityId:string,event:MouseEvent) {
 if(openRoster.value?.activityId===activityId){void closeRoster(true);return;}
 if(!props.stage)return;
 const trigger=event.currentTarget as HTMLButtonElement;
 const anchor=trigger.getBoundingClientRect(),stage=props.stage.getBoundingClientRect();
 const available=stage.bottom-anchor.bottom-12;
 const docked=available<150;
 openRoster.value={activityId,trigger,docked,style:{
  '--bmx-hearing-popup-right':Math.max(8,stage.right-anchor.right)+'px',
  ...(docked?{}:{top:anchor.bottom-stage.top+6+'px',maxHeight:Math.min(200,available)+'px'}),
 }};
}
function rosterKeydown(event:KeyboardEvent) {
 if(event.key==='Escape'&&!event.isComposing&&openRoster.value){
  event.preventDefault();
  event.stopPropagation();
  void closeRoster(true);
 }
}
function choosePerson(id:string) {
 void closeRoster();
 emit('person',id);
}
watch(()=>props.state.world.id,()=>{expanded.value.clear();echoesOpen.value=false;});
watch([()=>props.active,()=>props.stage,rows],()=>void closeRoster());
watch(openRoster,(roster,_previous,onCleanup)=>{
 const stage=props.stage,scroll=scrollRoot();
 if(!roster||!stage||!scroll)return;
 if(roster.docked){
  // At the list end the popup takes space from the viewport, so the last card can scroll clear of it.
  scroll.scrollTop+=Math.max(0,roster.trigger.getBoundingClientRect().bottom+4-scroll.getBoundingClientRect().bottom);
 }
 participantsPopup.value?.focus({preventScroll:true});
 const openedAt=scroll.scrollTop;
 const layout={width:stage.clientWidth,height:stage.clientHeight};
 const dismissOnScroll=()=>{if(openRoster.value===roster&&scroll.scrollTop!==openedAt)void closeRoster();};
 const dismissOutside=(event:MouseEvent)=>{
  if(openRoster.value!==roster)return;
  const target=event.target as Node;
  if(!roster.trigger.contains(target)&&!participantsPopup.value?.contains(target))void closeRoster();
 };
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{
  if(openRoster.value===roster&&(stage.clientWidth!==layout.width||stage.clientHeight!==layout.height))void closeRoster();
 });
 observer?.observe(stage);
 scroll.addEventListener('scroll',dismissOnScroll);
 stage.addEventListener('click',dismissOutside);
 onCleanup(()=>{
  scroll.removeEventListener('scroll',dismissOnScroll);
  stage.removeEventListener('click',dismissOutside);
  observer?.disconnect();
 });
},{flush:'post'});
</script>
<template>
 <section ref="root" class="bmx-page bmx-hearing-page" role="tabpanel" aria-labelledby="bmx-tab-hearing" @keydown="rosterKeydown">
  <ModuleHealth :state="state" :development="development" ready-label="事务已载入"/>
  <template v-for="section in sections" :key="section.id">
   <button v-if="section.id==='echoes'" class="bmx-hearing-echoes-toggle" type="button"
    :aria-expanded="echoesOpen" aria-controls="bmx-hearing-echoes" @click="toggleEchoes">
    <span class="bmx-hearing-echoes-rule" aria-hidden="true">
     <i v-for="(height,index) in echoWave" :key="index" :style="{height:height+'px'}"></i>
    </span>
    <span class="bmx-hearing-echoes-label">余音</span>
    <span class="bmx-hearing-echoes-rule is-end" aria-hidden="true">
     <i v-for="(height,index) in echoWave" :key="index" :style="{height:height+'px'}"></i>
    </span>
   </button>
   <div :id="section.id==='echoes'?'bmx-hearing-echoes':undefined" v-show="section.id!=='echoes'||echoesOpen">
    <template v-if="section.id!=='echoes'||echoesOpen">
     <article v-for="(row,index) in section.rows" :key="row.activity.id" class="bmx-hearing-task" :data-result-id="row.activity.id" :data-status="row.activity.status">
      <div class="bmx-hearing-timeline" :class="{'is-expanded':row.earlierProgress.length&&expanded.has(row.activity.id)}">
       <div class="bmx-hearing-step">
        <button v-if="row.earlierProgress.length" type="button" class="bmx-hearing-progress-toggle" :aria-expanded="expanded.has(row.activity.id)" :aria-controls="'bmx-hearing-progress-'+section.id+'-'+index" @click="toggleProgress(row.activity.id)">
         <span class="bmx-hearing-body">{{ row.body }}</span><i class="bmx-chevron" aria-hidden="true"></i>
        </button>
        <p v-else class="bmx-hearing-body">{{ row.body }}</p>
       </div>
       <ol v-if="row.earlierProgress.length" v-show="expanded.has(row.activity.id)" :id="'bmx-hearing-progress-'+section.id+'-'+index" class="bmx-hearing-history" aria-label="此前进展">
        <template v-if="expanded.has(row.activity.id)">
         <li v-for="entry in row.earlierProgress" :key="entry.id" class="bmx-hearing-step bmx-hearing-previous">{{ entry.body }}</li>
        </template>
       </ol>
      </div>
      <footer class="bmx-hearing-footer">
       <span class="bmx-task-status" :data-status="row.activity.status" :title="row.activity.status==='completed'?'整条事项已完成':undefined">{{ row.activity.status==='active'?'推进中':activityStatusLabel(row.activity) }}</span>
       <button v-if="row.people.length>3" type="button" class="bmx-hearing-member-group" :aria-label="`查看全部 ${row.people.length} 位参与人物`" :aria-expanded="openRoster?.activityId===row.activity.id" aria-haspopup="dialog" :aria-controls="openRoster?.activityId===row.activity.id?'bmx-hearing-people':undefined" @click="toggleRoster(row.activity.id,$event)">
        <span class="bmx-hearing-avatar-stack" aria-hidden="true"><SmileAvatar v-for="p in row.people.slice(0,3)" :key="p.id" class="bmx-hearing-stacked-avatar" :person-id="p.id" :temperament="p.temperament" :size="18"/></span>
        <i class="bmx-hearing-ellipsis" aria-hidden="true"></i>
       </button>
       <div v-else-if="row.people.length" class="bmx-hearing-members">
        <button v-for="p in row.people" :key="p.id" type="button" class="bmx-hearing-member" :title="p.name" @click="emit('person',p.id)">
         <SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="18"/><span class="bmx-hearing-member-name" :class="{'is-long':[...p.name].length>3}">{{ p.name }}</span>
        </button>
       </div>
      </footer>
     </article>
    </template>
   </div>
  </template>
  <p v-if="!rows.length" class="bmx-empty-state">暂无事务。</p>
  <Teleport v-if="stage&&openRoster" :to="stage">
   <aside id="bmx-hearing-people" ref="participantsPopup" class="bmx-hearing-participants-popup" :class="{'is-docked':openRoster.docked}" :style="openRoster.style" role="dialog" aria-label="参与人物" tabindex="-1" @keydown="rosterKeydown">
    <header><span>参与人物</span><button type="button" class="bmx-hearing-close-people bmx-icon-button" aria-label="关闭参与人物" @click="closeRoster(true)"><i aria-hidden="true"></i></button></header>
    <div class="bmx-hearing-people-list">
     <button v-for="p in rosterPeople" :key="p.id" type="button" class="bmx-hearing-person-option" @click="choosePerson(p.id)">
      <SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="24"/><span>{{ p.name }}</span>
     </button>
    </div>
   </aside>
  </Teleport>
 </section>
</template>
