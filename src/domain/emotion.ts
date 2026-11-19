import {storyMinutes} from '../host/story-clock';

export const EMOTION_KEYS=['affinity','satisfaction','excitement','relaxation','anticipation','worry','fear','disappointment','sadness','dissatisfaction','aversion'] as const;
export type EmotionKey=typeof EMOTION_KEYS[number];
export type EmotionValues=Partial<Record<EmotionKey,number>>;
export const EMOTION_NAMES:Record<EmotionKey,string>={affinity:'亲近',satisfaction:'满足',excitement:'兴奋',relaxation:'松弛',anticipation:'期待',worry:'担忧',fear:'恐惧',disappointment:'失望',sadness:'悲伤',dissatisfaction:'不满',aversion:'反感'};
export const EMOTION_RULES={max:100,ordinaryCeiling:45,minorRise:8,minorHalfLifeMinutes:120,majorHalfLifeMinutes:1440,worryFloor:25,balanceThreshold:70,balanceValue:55,quietThreshold:5,softThreshold:15,presentThreshold:20,noticeableThreshold:45,strongThreshold:70} as const;
const EMOTION_ALIASES:Partial<Record<EmotionKey,string[]>>={affinity:['喜爱','love'],anticipation:['好奇','curiosity'],fear:['害怕'],dissatisfaction:['愤怒','anger']};
const negative=new Set<EmotionKey>(['worry','fear','disappointment','sadness','dissatisfaction','aversion']);
export interface EmotionState {
 values:EmotionValues;
 publicBasis?:string;
 severity:'ordinary'|'major';
 ongoing:boolean;
 /** Verbatim formal public evidence of an unresolved cause. */
 ongoingBasis?:string;
 trend?:'easing'|'changed';
 /** The last trusted story clock consumed, independent of call count. */
 clock?:string;
 throughSeq:number|null;
 /** Only the last accepted stimulus, not an event or personal emotion database. */
 stimulusRefs:string[];
}
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
export function normalizeEmotionValues(value:unknown):EmotionValues|undefined {
 const row=object(value);if(!row)return undefined;const values:EmotionValues={};
 for(const key of EMOTION_KEYS){const field=[key,EMOTION_NAMES[key],...(EMOTION_ALIASES[key]??[])].find(name=>Object.hasOwn(row,name));const raw=field?row[field]:undefined;
  const numeric=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw.trim())?Number(raw):NaN;
  if(Number.isFinite(numeric)&&numeric>=0&&numeric<=EMOTION_RULES.max)values[key]=numeric;
 }
 return Object.keys(values).length?values:undefined;
}
/** Invalid optional components stay local; never make the legacy text unreadable. */
export function readEmotion(value:unknown):EmotionState|undefined {
 const row=object(value),values=normalizeEmotionValues(row?.values);if(!row||!values)return undefined;
 const ongoingBasis=row.ongoing===true&&typeof row.ongoingBasis==='string'&&row.ongoingBasis.trim()?row.ongoingBasis:undefined;
 return {values,...(['easing','changed'].includes(row.trend as string)?{trend:row.trend as 'easing'|'changed'}:{}),...(typeof row.publicBasis==='string'&&row.publicBasis.trim()?{publicBasis:row.publicBasis.trim()}:{}),severity:row.severity==='major'?'major':'ordinary',ongoing:Boolean(ongoingBasis),...(ongoingBasis?{ongoingBasis}:{}),...(storyMinutes(row.clock)!==null?{clock:row.clock as string}:{}),throughSeq:Number.isInteger(row.throughSeq)?row.throughSeq as number:null,stimulusRefs:Array.isArray(row.stimulusRefs)?row.stimulusRefs.filter((ref):ref is string=>typeof ref==='string'):[]};
}
export function advanceEmotion(value:unknown,clock:string|null|undefined):EmotionState|undefined {
 const old=readEmotion(value);if(!old)return undefined;
 const from=storyMinutes(old.clock),to=storyMinutes(clock);
 if(to===null)return old;
 if(from===null)return {...old,clock:clock!};
 if(to<=from)return old;
 const values={...old.values};
 for(const key of EMOTION_KEYS){if(key==='affinity')continue;const strength=values[key];if(strength===undefined)continue;
  const halfLife=old.severity==='major'?EMOTION_RULES.majorHalfLifeMinutes:EMOTION_RULES.minorHalfLifeMinutes;
  const floor=key==='worry'&&old.ongoing?Math.min(strength,EMOTION_RULES.worryFloor):0;
  values[key]=Math.max(floor,strength*2**(-(to-from)/halfLife));
 }
 return {...old,values,clock:clock!,...(EMOTION_KEYS.some(key=>(values[key]??0)<(old.values[key]??0))?{trend:'easing' as const}:{})};
}
export function updateEmotion(oldValue:unknown,assessment:unknown,context:{clock:string|null;throughSeq:number|null;refs:string[];newChange:boolean;majorAllowed:boolean;ongoingBasis?:string;affinityAllowed?:boolean}):EmotionState|undefined {
 const old=advanceEmotion(oldValue,context.clock),row=object(assessment),requested=normalizeEmotionValues(row?.values);
 if(!row||!requested||row.visibility!==undefined&&row.visibility!=='public')return old;
 if(old&&old.throughSeq!==null&&context.throughSeq!==null&&context.throughSeq<=old.throughSeq)return old;
 const fresh=context.newChange&&context.refs.some(ref=>!old?.stimulusRefs.includes(ref));
 const from=storyMinutes(readEmotion(oldValue)?.clock),to=storyMinutes(context.clock);
 const elapsed=from!==null&&to!==null&&to>from;
 if(old&&!fresh&&!elapsed)return old;
 const major=row.change==='major'&&fresh&&context.majorAllowed;
 const values:EmotionValues={...old?.values};
 for(const key of EMOTION_KEYS){const target=requested[key];if(target===undefined)continue;const previous=old?.values[key];
  if(key==='affinity'&&previous!==undefined&&(!fresh||!context.affinityAllowed))continue;
  if(!negative.has(key)){values[key]=target;continue;}
  if(previous===undefined){values[key]=major?target:Math.min(target,EMOTION_RULES.ordinaryCeiling);continue;}
  if(target<=previous){values[key]=target;continue;}
  values[key]=major?target:fresh&&row.change==='minor'?Math.max(previous,Math.min(target,previous+EMOTION_RULES.minorRise,EMOTION_RULES.ordinaryCeiling)):previous;
 }
 if((values.relaxation??0)>=EMOTION_RULES.balanceThreshold&&(values.excitement??0)>=EMOTION_RULES.balanceThreshold){values.relaxation=EMOTION_RULES.balanceValue;values.excitement=EMOTION_RULES.balanceValue;}
 const previousNegative=Math.max(0,...[...negative].map(key=>old?.values[key]??0)),nextNegative=Math.max(0,...[...negative].map(key=>values[key]??0));
 const trend=old&&nextNegative<previousNegative?'easing':old&&EMOTION_KEYS.some(key=>values[key]!==old.values[key])?'changed':old?.trend;
 const ongoingBasis=fresh&&row.ongoing===false?undefined:fresh&&row.ongoing===true&&context.ongoingBasis?context.ongoingBasis:old?.ongoingBasis;
 const previousClock=storyMinutes(old?.clock),nextClock=storyMinutes(context.clock);
 return {values,...(trend?{trend}:{}),...(typeof row.publicBasis==='string'&&row.publicBasis.trim()?{publicBasis:row.publicBasis.trim()}:old?.publicBasis?{publicBasis:old.publicBasis}:{}),severity:major?'major':old?.severity??'ordinary',ongoing:Boolean(ongoingBasis),...(ongoingBasis?{ongoingBasis}:{}),...(nextClock!==null&&(previousClock===null||nextClock>=previousClock)?{clock:context.clock!}:old?.clock?{clock:old.clock}:{}),throughSeq:context.throughSeq,stimulusRefs:fresh?[...new Set(context.refs)].sort():old?.stimulusRefs??[]};
}
/** Multiple winds combine by component maxima: duplicate rows cannot amplify a circle. */
export function combineEmotions(rows:unknown[]):EmotionValues|undefined {
 const values:EmotionValues={};for(const row of rows){const valid=normalizeEmotionValues(row);if(!valid)continue;for(const key of EMOTION_KEYS)if(valid[key]!==undefined)values[key]=Math.max(values[key]??0,valid[key]!);}
 if((values.relaxation??0)>=EMOTION_RULES.balanceThreshold&&(values.excitement??0)>=EMOTION_RULES.balanceThreshold){values.relaxation=EMOTION_RULES.balanceValue;values.excitement=EMOTION_RULES.balanceValue;}
 return Object.keys(values).length?values:undefined;
}
export function emotionSummary(value:unknown):string {
 const state=readEmotion(value);if(!state)return '';
 const strongest=EMOTION_KEYS.filter(key=>(state.values[key]??0)>=EMOTION_RULES.quietThreshold).sort((a,b)=>state.values[b]!-state.values[a]!).slice(0,3);
 const feelings=strongest.map(key=>`${EMOTION_NAMES[key]}${state.values[key]!>EMOTION_RULES.strongThreshold?'强烈':state.values[key]!>EMOTION_RULES.noticeableThreshold?'明显':state.values[key]!>EMOTION_RULES.softThreshold?'适度':'轻微'}`).join('、');
 return `${feelings?'当前'+feelings:'当前起伏已趋平缓'}。${state.publicBasis??''}`;
}
export function emotionGuidance(value:unknown):string|undefined {
 const state=readEmotion(value);if(!state)return undefined;
 return `${emotionSummary(state)} 当前有效强弱以emotion.values为准，description保留该圈已接纳的自然说明；已回落的程度不得沿旧措辞重新升高。紧绷时寻找自然降温、沟通或照常相处的机会，不强制和解。持续原因不作每轮加码；自主内容限小摩擦、冷淡和修复，重大冲突须本批正式主剧情明确依据。长期关系沿foundation，不由短时颜色改写；数值和颜色不产生事实或人物知情。`;
}
