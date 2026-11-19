<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {easeFolderMotion,smellFolderPose} from './smell-folder-layout';

type FolderLabel={medium:string;count:number;recent:boolean;tone:string};
const props=defineProps<{folders:FolderLabel[];enabled:boolean;active:boolean;reading?:string;scopeId:string|null}>();
const emit=defineEmits<{open:[medium:string,origin:HTMLButtonElement]}>();
const surface=ref<HTMLElement>(),focused=ref(''),movingPosition=ref<number|null>(null);
const focusedIndex=computed(()=>{
  const selected=props.folders.findIndex(item=>item.medium===focused.value);
  return selected>=0?selected:Math.max(0,props.folders.findIndex(item=>item.medium==='纸媒'));
});
const position=computed(()=>movingPosition.value??focusedIndex.value);
const notices=computed(()=>props.folders.filter(item=>item.recent));
const ready=()=>props.enabled&&props.active&&!props.reading;
function folderIndex(index:number){
  const count=props.folders.length;
  return count?((index%count)+count)%count:0;
}
function folderDistance(index:number,from:number) {
  const count=props.folders.length,delta=index-from;
  return count?delta-Math.round(delta/count)*count:0;
}
const tiles=computed(()=>props.folders.map((item,index)=>{
  const distance=folderDistance(index,position.value),pose=smellFolderPose(distance);
  return {item,pose,style:{
    // The reference panel is x=8..382 with content y=103..704 and the deck in the left 64%.
    left:(pose.x-8)/(374*.64)*100+'%',top:(pose.y-103)/601*100+'%',
    '--bmx-folder-scale':pose.scale,'--bmx-folder-unfold':pose.unfold,
    opacity:pose.opacity,zIndex:Math.round((3-Math.min(3,Math.abs(distance)))*100),
  }};
}));
const readout=computed(()=>tiles.value[folderIndex(Math.round(position.value))]);

let frame:number|undefined;
let wheelTime=-Infinity,wheelDistance=0,nextWheel=-Infinity;
let ignorePointerClick=false;
let pointer:{id:number;x:number;y:number;from:number;step:number;axis?:'vertical'|'horizontal'}|undefined;

function stopMotion(){
  if(frame!==undefined)window.cancelAnimationFrame?.(frame);
  frame=undefined;
}
function slide(from:number,to:number,duration:number){
  stopMotion();
  if(from===to||!window.requestAnimationFrame||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    movingPosition.value=null;return;
  }
  movingPosition.value=from;
  let started:number|undefined;
  const tick=(now:number)=>{
    started??=now;
    const t=(now-started)/duration;
    if(t>=1){frame=undefined;movingPosition.value=null;return;}
    movingPosition.value=from+(to-from)*easeFolderMotion(t);
    frame=window.requestAnimationFrame(tick);
  };
  frame=window.requestAnimationFrame(tick);
}
const tileFor=(medium:string)=>Array.from(surface.value?.querySelectorAll<HTMLButtonElement>('.bmx-smell-folder')??[])
  .find(node=>node.getAttribute('data-medium')===medium);
function select(index:number,duration=480,keyboard=false){
  const from=position.value,to=from+folderDistance(index,from),item=props.folders[folderIndex(index)];
  if(!item)return;
  const root=surface.value?.getRootNode() as Document|ShadowRoot|undefined;
  const moveFocus=keyboard||!!root?.activeElement?.matches('.bmx-smell-folder');
  focused.value=item.medium;
  if(Math.abs(to-from)>2||duration===0){stopMotion();movingPosition.value=null;}
  else slide(from,to,duration);
  if(moveFocus)void nextTick(()=>tileFor(item.medium)?.focus({preventScroll:true}));
}
function resetMotion(){
  stopMotion();
  pointer=undefined;ignorePointerClick=false;movingPosition.value=null;
  wheelTime=nextWheel=-Infinity;wheelDistance=0;
}
watch(()=>props.scopeId,()=>{focused.value='';resetMotion();});
watch(()=>props.active,active=>{if(!active)resetMotion();});
watch(()=>props.folders.map(item=>item.medium).join('\0'),resetMotion);
watch(()=>props.reading,reading=>{
  if(reading)stopMotion();
  else if(props.active&&movingPosition.value!==null)slide(position.value,position.value+folderDistance(focusedIndex.value,position.value),240);
});
onBeforeUnmount(stopMotion);

function keydown(event:KeyboardEvent){
  if(!ready()||event.altKey||event.ctrlKey||event.metaKey)return;
  const steps:Record<string,number>={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1};
  const direction=steps[event.key];
  if(!direction&&event.key!=='Home'&&event.key!=='End')return;
  event.preventDefault();
  const target=direction?focusedIndex.value+direction:event.key==='Home'?0:props.folders.length-1;
  select(target,direction?480:0,true);
}
function wheel(event:WheelEvent){
  if(!ready()||event.ctrlKey||pointer?.axis)return;
  const delta=event.deltaY||event.deltaX;
  const target=folderIndex(focusedIndex.value+Math.sign(delta));
  if(!delta||target===focusedIndex.value)return;
  event.preventDefault();
  const now=event.timeStamp;
  if(now-wheelTime>160||Math.sign(wheelDistance)!==Math.sign(delta))wheelDistance=0;
  wheelTime=now;
  if(now<nextWheel)return;
  wheelDistance+=delta*(event.deltaMode===1?16:event.deltaMode===2?80:1);
  if(Math.abs(wheelDistance)<25)return;
  wheelDistance=0;nextWheel=now+220;select(target);
}
function pointerDown(event:PointerEvent){
  if(!ready()||event.isPrimary===false||event.button!==0)return;
  ignorePointerClick=false;
  if(props.folders.length<2||(event.target as Element|null)?.closest?.('.bmx-smell-generate'))return;
  const step=Math.max(48,(surface.value?.getBoundingClientRect().height??0)*.145);
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,from:position.value,step};
}
function pointerMove(event:PointerEvent){
  if(pointer?.id!==event.pointerId)return;
  const x=event.clientX-pointer.x,y=event.clientY-pointer.y;
  if(!pointer.axis){
    if(Math.hypot(x,y)<7)return;
    pointer.axis=Math.abs(y)>=Math.abs(x)?'vertical':'horizontal';
    pointer.from=position.value;
    surface.value?.setPointerCapture?.(event.pointerId);
    if(pointer.axis==='vertical')stopMotion();
  }
  if(pointer.axis==='vertical')movingPosition.value=pointer.from-y/pointer.step;
}
function pointerEnd(event:PointerEvent,cancelled=false){
  if(pointer?.id!==event.pointerId)return;
  const gesture=pointer;pointer=undefined;
  if(!gesture.axis)return;
  ignorePointerClick=true;
  if(gesture.axis!=='vertical')return;
  const delta=gesture.y-event.clientY;
  const rounded=Math.round(position.value);
  const target=cancelled?focusedIndex.value:folderIndex(rounded)===focusedIndex.value&&Math.abs(delta)>=24
    ?rounded+Math.sign(delta):rounded;
  select(target,240);
}
function pointerLeave(event:PointerEvent){
  if(pointer?.id===event.pointerId&&!pointer.axis)pointer=undefined;
}
function lostCapture(event:PointerEvent){
  if(event.target===surface.value)pointerEnd(event,true);
}
function activate(item:FolderLabel,event:MouseEvent,fromNotice=false){
  if(ignorePointerClick&&event.detail>0){ignorePointerClick=false;return;}
  if(!ready())return;
  stopMotion();
  if(!fromNotice){
    emit('open',item.medium,event.currentTarget as HTMLButtonElement);
    return;
  }
  const index=props.folders.findIndex(folder=>folder.medium===item.medium);
  if(index<0)return;
  select(index,0);
  void nextTick(()=>{
    const tile=tileFor(item.medium);
    if(ready()&&tile)emit('open',item.medium,tile);
  });
}
</script>

<template>
 <div ref="surface" class="bmx-smell-folders" :data-swipe="active&&folders.length>1 ? '' : undefined" @wheel="wheel"
  @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd($event)"
  @pointercancel="pointerEnd($event,true)" @pointerleave="pointerLeave" @lostpointercapture="lostCapture">
  <div class="bmx-smell-arc" role="group" aria-label="公开消息载体" @keydown="keydown">
   <button v-for="({item,pose,style},index) in tiles" :key="item.medium" type="button" class="bmx-smell-folder"
    :data-medium="item.medium" :data-tone="item.tone" :style="style" :disabled="!enabled"
    :data-caption="pose.caption ? '' : undefined" :data-offstage="pose.visible ? undefined : ''"
    :aria-hidden="pose.visible ? undefined : true" :aria-current="index===focusedIndex ? true : undefined" aria-haspopup="dialog"
    :aria-expanded="reading===item.medium" :aria-controls="reading===item.medium?'bmx-smell-folder-view':undefined"
    :tabindex="index===focusedIndex&&pose.visible ? 0 : -1"
    :title="item.medium" :aria-label="item.medium+'，'+item.count+' 条'+(item.recent?'，有新消息':'')"
    @click="activate(item,$event)">
    <span class="bmx-smell-back" aria-hidden="true"></span>
    <span class="bmx-smell-mouth" aria-hidden="true"></span>
    <span v-if="item.count" class="bmx-smell-papers" aria-hidden="true">
     <span v-if="item.count>1" class="bmx-smell-peek is-behind"></span>
     <span class="bmx-smell-peek"></span>
    </span>
    <span class="bmx-smell-front" aria-hidden="true"></span>
    <span class="bmx-smell-lid" aria-hidden="true"></span>
    <span class="bmx-smell-folder-caption" aria-hidden="true"><strong>{{ item.medium }}</strong><small>{{ item.count }} 条</small></span>
   </button>
  </div>
  <div v-if="notices.length" class="bmx-smell-notices" role="group" aria-label="有新消息的载体">
   <button v-for="item in notices" :key="item.medium" type="button" class="bmx-smell-update" aria-haspopup="dialog" :disabled="!enabled"
    :aria-expanded="reading===item.medium" :aria-controls="reading===item.medium?'bmx-smell-folder-view':undefined"
    :aria-label="item.medium+'有新消息'" :title="item.medium+'有新消息'" @click="activate(item,$event,true)">
    <span class="bmx-smell-update-label"><span>{{ item.medium }}</span><span>有新消息</span></span>
   </button>
  </div>
  <div v-if="readout" class="bmx-smell-readout">
   <strong :title="readout.item.medium" :style="{opacity:readout.pose.readout}" aria-hidden="true">{{ readout.item.medium }}</strong>
   <span :style="{opacity:readout.pose.readout}" aria-hidden="true">{{ readout.item.count }} 条</span>
   <slot/>
  </div>
 </div>
</template>
