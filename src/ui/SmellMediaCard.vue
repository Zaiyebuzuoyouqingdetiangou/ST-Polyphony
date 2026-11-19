<script setup lang="ts">
import {computed} from 'vue';
import type {PublicMessage} from '../domain/public-messages';

const props=defineProps<{entry:PublicMessage;medium:string;recordId:string}>();
const mediaTypes=[
  ['record',/实录|转写|录音|采访|访谈|问答|transcript|recording|interview/iu],
  ['radio',/广播|电台|口播|播报|radio|broadcast/iu],
  ['rumor',/传闻|流言|风闻|街谈|传言|rumou?r|gossip/iu],
  ['letter',/公开信|信笺|信件|书信|公函|letter|correspondence/iu],
  ['note',/便签|便条|短签|留言条|备忘|memo|sticky.note|note/iu],
  ['newspaper',/报纸|报刊|街报|剪报|新闻|报道|晚报|日报|周报|月报|小报|电子[刊报]|newspaper|press|article/iu],
  ['notice',/告示|布告|公告|公示|海报|通告|启事|传单|notice|bulletin/iu],
  ['channel',/频道|论坛|帖子|频道帖|公开群|社区帖|channel|forum|public.feed/iu],
] as const;
const findType=(value:string)=>mediaTypes.find(([,pattern])=>pattern.test(value))?.[0];
const kind=computed(()=>{
  if(props.medium==='副刊')return 'supplement';
  if(props.medium==='专题')return 'feature';
  // A specific article type wins over its folder, including old entries with freeform types.
  return findType(props.entry.type)??findType(props.medium)??'plain';
});
const variant=computed(()=>{
  let seed=0;
  for(const char of props.recordId)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
  return (['a','b','c'] as const)[seed%3];
});
const layout=computed(()=>kind.value+'-'+variant.value);
const longForm=computed(()=>kind.value==='feature'||kind.value==='supplement');
const chunks=computed(()=>{
  const paragraphs=props.entry.body.split(/\r?\n/u).map(part=>part.trim()).filter(Boolean);
  const half=['letter-c','rumor-a','rumor-b','rumor-c'].includes(layout.value);
  const firstLength=paragraphs[0]?.length??0;
  const hasLead=['newspaper-b','newspaper-c'].includes(layout.value)&&firstLength<=75
    ||layout.value==='feature-a'&&firstLength<=140;
  const divided=half||hasLead||layout.value==='notice-c';
  const split=divided&&paragraphs.length>1?(half?Math.ceil(paragraphs.length/2):1):paragraphs.length;
  return {first:paragraphs.slice(0,split),second:paragraphs.slice(split)};
});
const airtime=computed(()=>{
  if(layout.value!=='radio-b')return '';
  return props.entry.storyTime?.match(/(?<!\d)(?:[01]?\d|2[0-3])[:：][0-5]\d(?!\d)/u)?.[0]??'';
});
const signed=computed(()=>['letter-b','letter-c'].includes(layout.value));
const wave=computed(()=>['radio-a','radio-c','record-b'].includes(layout.value));
const waveform=[8,14,10,22,32,21,14,9,16,25,36,27,18,13,24,32,20,15,9,14,25,34,24,16,12,8,17,22,15,10,5];
</script>

<template>
  <article class="bmx-smell-sheet" :data-media="kind" :data-variant="variant">
    <div v-if="layout==='letter-a'" class="bmx-media-envelope" aria-hidden="true"><i></i></div>
    <header class="bmx-media-heading">
      <div v-if="!signed" class="bmx-media-masthead">
        <span class="bmx-media-source">{{ entry.source }}</span>
        <div v-if="longForm" class="bmx-media-imprint">
          <span class="bmx-media-edition">{{ entry.type }}</span>
          <span v-if="entry.storyTime" class="bmx-media-time">{{ entry.storyTime }}</span>
        </div>
        <span v-else-if="entry.storyTime && entry.storyTime!==airtime" class="bmx-media-time">{{ entry.storyTime }}</span>
      </div>
      <div v-if="layout!=='radio-c'" class="bmx-media-headline" :data-airtime="airtime ? '' : undefined">
        <span v-if="airtime" class="bmx-media-airtime">{{ airtime }}</span>
        <h3>{{ entry.title }}</h3>
      </div>
    </header>
    <div v-if="wave" class="bmx-media-wave" aria-hidden="true">
      <i v-for="(height,index) in waveform" :key="index" :style="{'--bmx-wave-size':height+'px'}"></i>
    </div>
    <div class="bmx-media-body" :data-split="chunks.second.length ? '' : undefined">
      <div v-if="layout==='radio-c'" class="bmx-media-headline"><h3>{{ entry.title }}</h3></div>
      <div class="bmx-media-first">
        <p v-for="(paragraph,index) in chunks.first" :key="index" :data-question="/^(?:问[：:]|Q[：:]|Q\s)/iu.test(paragraph) ? '' : undefined">{{ paragraph }}</p>
      </div>
      <div v-if="chunks.second.length" class="bmx-media-second">
        <p v-for="(paragraph,index) in chunks.second" :key="index">{{ paragraph }}</p>
      </div>
    </div>
    <footer class="bmx-media-footer">
      <div v-if="signed" class="bmx-media-signature">
        <span>{{ entry.source }}</span><span v-if="entry.storyTime">{{ entry.storyTime }}</span>
      </div>
      <div class="bmx-media-origin"><span v-if="!longForm">{{ entry.type }}</span><span>第 {{ entry.sourceSeq }} 楼</span></div>
    </footer>
  </article>
</template>
