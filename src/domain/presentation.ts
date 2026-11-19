import type {SourcePerson} from './source-people';

export const TEMPERAMENTS=['gentle','bright','reserved','sharp','sensitive','unknown'] as const;
export type Temperament=typeof TEMPERAMENTS[number];
export function isTemperament(value:unknown):value is Temperament {
 return TEMPERAMENTS.some(kind=>kind===value);
}
export interface PresentationSource {personality:string;relations:string}
export interface ProfileRelation {fromPersonId:string;toPersonId:string;fromRole:string;toRole:string;directed:boolean}
export interface PresentationHint {
  personId:string;
  /** Retired model hint, retained for old saves. */
  temperament?:{basisKey:string;value:Temperament};
  profileRelations?:{basisKey:string;items:ProfileRelation[]};
}
export interface AtmosphereVisual {temperature:'cold'|'neutral'|'warm';rhythm:'calm'|'flowing'|'agitated'}
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const AVATAR_CUES: Array<[Temperament, RegExp]> = [
 ['reserved',/冷漠|冷淡|冷峻|淡漠|高冷|疏离|寡言|内敛|不苟言笑|克制/gu],
 ['bright',/小太阳|开朗|活泼|乐观|爽朗|热情|爱笑/gu],
 ['gentle',/温柔|温和|随和|和善|体贴|耐心|宽厚/gu],
 ['sharp',/尖锐|刻薄|毒舌|强势|凌厉|易怒|暴躁/gu],
 ['sensitive',/敏感|细腻|羞怯|害羞|容易紧张|多愁善感/gu],
];
// QQJ includes these adjacent blocks in its presentation string, including multiline values.
const otherProfileFields = /^(?:likes|dislikes|principles):[^\n]*(?:\n(?!(?:personality|conduct|expression|principles|likes|dislikes):)[^\n]*)*/gmu;
const negatedCue = /(?:不|并非|谈不上|没有|并无)(?:算|够|太|很|再|那么|怎么)?$/u;

export function avatarTemperament(personality: string | undefined): Temperament {
 const text = (personality ?? '').replace(otherProfileFields, '');
 let first = Infinity;
 let temperament: Temperament = 'unknown';
 for(const [kind, words] of AVATAR_CUES) {
  for(const {index} of text.matchAll(words)) {
   if(index >= first) break;
   if(negatedCue.test(text.slice(Math.max(0,index-6), index))) continue;
   first = index;
   temperament = kind;
   break;
  }
 }
 return temperament;
}

export const PROFILE_RELATION_INSTRUCTIONS = 'presentationUpdates可选，只处理presentationRequests指定的关系。每项含personId与profileRelations。关系只据该人物的identityRelations明示原文，使用正式人物代号及fromPersonId/toPersonId/fromRole/toRole/directed，准确保留双方角色。未请求或不确定的项省略，不重贴已有关系。';

/** Source-owned display hints are discardable; only the exact relevant profile field binds them. */
export function presentationBasis(value:string):string {
 let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}return `v1:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
export function normalizeAtmosphereVisual(value:unknown):AtmosphereVisual|undefined {
 const row=object(value);if(!row)return undefined;
 const temperature=['cold','neutral','warm'].includes(row.temperature as string)?row.temperature as AtmosphereVisual['temperature']:undefined;
 const rhythm=['calm','flowing','agitated'].includes(row.rhythm as string)?row.rhythm as AtmosphereVisual['rhythm']:undefined;
 return temperature||rhythm?{temperature:temperature??'neutral',rhythm:rhythm??'flowing'}:undefined;
}
export function validPresentation(person:{presentationSource?:PresentationSource},hint:PresentationHint|undefined) {
 const source=person.presentationSource;
 return {
  relations:source?.relations&&hint?.profileRelations?.basisKey===presentationBasis(source.relations)&&Array.isArray(hint.profileRelations.items)?hint.profileRelations.items:undefined,
 };
}
export function presentationRequests(people:SourcePerson[],hints:PresentationHint[]=[]) {
 const byId=new Map(hints.map(h=>[h.personId,h]));
 return people.flatMap(person=>{
  const identityRelations=person.presentationSource?.relations;
  return identityRelations&&validPresentation(person,byId.get(person.id)).relations===undefined?[{personId:person.id,identityRelations}]:[];
 });
}
export function applyPresentation(people:SourcePerson[],previous:PresentationHint[]=[],updates:unknown):PresentationHint[] {
 const byId=new Map(previous.map(h=>[h.personId,h])),sources=new Map(people.map(p=>[p.id,p]));
 if(!Array.isArray(updates))return previous;
 const needed=new Map(presentationRequests(people,previous).map(row=>[row.personId,row]));
 for(const value of updates){const row=object(value),person=typeof row?.personId==='string'?sources.get(row.personId):undefined;if(!row||!person)continue;
  const request=needed.get(person.id);if(!request)continue;
  const source=person.presentationSource;
  if(request.identityRelations&&source?.relations&&Array.isArray(row.profileRelations)){
   const items:ProfileRelation[]=[];
   for(const value of row.profileRelations){const edge=object(value);if(!edge||typeof edge.fromPersonId!=='string'||typeof edge.toPersonId!=='string'||edge.fromPersonId===edge.toPersonId||!sources.has(edge.fromPersonId)||!sources.has(edge.toPersonId)||typeof edge.fromRole!=='string'||!edge.fromRole.trim()||typeof edge.toRole!=='string'||!edge.toRole.trim()||typeof edge.directed!=='boolean')continue;
    items.push({fromPersonId:edge.fromPersonId,toPersonId:edge.toPersonId,fromRole:edge.fromRole.trim(),toRole:edge.toRole.trim(),directed:edge.directed});
   }
   // A deliberate empty set is useful; malformed nonempty sets do not erase valid hints.
   if(items.length||row.profileRelations.length===0)byId.set(person.id,{...byId.get(person.id),personId:person.id,profileRelations:{basisKey:presentationBasis(source.relations),items}});
  }
 }
 return [...byId.values()];
}
