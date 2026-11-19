import type {SourceRef,WorldEvent} from './world';
import type {SourcePerson} from './source-people';
import type {PresentationSource} from './presentation';
export interface FoundationFields {identity:string;motivations:string;disposition:string;interests:string;life:string}
export interface FoundationPerson extends FoundationFields {id:string;name:string;aliases:string[];qqjPersonId?:string;specialRole?:string;sources:SourceRef[];basisEventIds?:string[];establishedWindowId:string;currentStateWindowId:string}
export interface GroupMember {personId:string;role?:string;fromWindowId:string;toWindowId?:string}
export interface TasteCircleSettings {manualTitle?:string;generatedTitle?:string;personIds?:string[];hidden?:true}
export interface SocialGroup {id:string;name:string;description:string;members:GroupMember[];sources:SourceRef[];basisEventIds?:string[];establishedWindowId:string;currentStateWindowId:string;endedWindowId?:string;taste?:TasteCircleSettings}
export interface WorldRelation {id:string;fromPersonId:string;toPersonId:string;fromRole:string;toRole:string;directed:boolean;sources:SourceRef[];basisEventIds?:string[];establishedWindowId:string;endedWindowId?:string;taste?:TasteCircleSettings}
export interface FoundationContext {id:string;text:string;sources:SourceRef[];basisEventIds?:string[];establishedWindowId:string;currentStateWindowId:string}
export interface WorldFoundation {throughSeq:number;windowId:string;people:FoundationPerson[];groups:SocialGroup[];relations:WorldRelation[];context?:FoundationContext[]}
export const foundationFields=['identity','motivations','disposition','interests','life'] as const;
export const CONSTRUCTION_REFERENCE_PREFIX='construction-reference:';
export const hasIndependentFoundationSource=(row:{sources:SourceRef[]})=>row.sources.some(source=>source.kind!=='plugin'&&!(source.kind==='simulation'&&source.id.startsWith(CONSTRUCTION_REFERENCE_PREFIX)));
const hasAcceptedSource=(row:{sources:SourceRef[]})=>hasIndependentFoundationSource(row)||row.sources.some(source=>source.kind==='simulation'&&source.id.startsWith(CONSTRUCTION_REFERENCE_PREFIX));
export function foundationDescription(person:FoundationFields) {return foundationFields.map(key=>person[key]).filter(Boolean).join('\n');}
type CurrentProfile=Pick<SourcePerson,'identityDescription'|'presentationSource'|'manualProfile'>;
const identityFields=['occupation','socialIdentity'];
const pinned=(person:CurrentProfile|undefined,fields:string[])=>fields.some(field=>Object.hasOwn(person?.manualProfile??{},field));
export const hasManualDisposition=(person:Pick<SourcePerson,'manualProfile'>|undefined)=>pinned(person,['personality','conduct','expression','principles']);
function currentFoundationFields(seed:FoundationPerson,person:CurrentProfile|undefined):FoundationFields {
 return {...Object.fromEntries(foundationFields.map(key=>[key,seed[key]])),...(pinned(person,identityFields)?{identity:person?.identityDescription??''}:{}),...(hasManualDisposition(person)?{disposition:person?.presentationSource?.personality??''}:{}),...(pinned(person,['likes','dislikes'])?{interests:['likes','dislikes'].flatMap(field=>person?.manualProfile?.[field]?[person.manualProfile[field]]:[]).join('\n')}:{} )} as FoundationFields;
}
/** Legacy public summaries follow the live profile; accepted construction remains local, with manual clears first. */
export function foundationForInput(foundation:WorldFoundation|undefined,people:Array<{id:string;name?:string;displayName?:string;aliases?:string[];description:string;identityDescription?:string;profileMaterialProvided?:boolean;presentationSource?:PresentationSource;manualProfile?:Record<string,string>}>):WorldFoundation|undefined {
 if(!foundation)return undefined;const live=new Map(people.map(person=>[person.id,person]));
 return {...foundation,people:foundation.people.map(seed=>{const person=live.get(seed.id);return {...seed,...currentFoundationFields(seed,person),name:person?.displayName??person?.name??seed.name,aliases:person?.aliases??seed.aliases,...(person?.profileMaterialProvided&&!hasAcceptedSource(seed)?{identity:person.identityDescription??'',motivations:'',disposition:person.presentationSource?.personality??'',interests:'',life:''}:{})};}),groups:foundation.groups,relations:foundation.relations};
}
/** External profiles stay external; the world owns only its short foundation and explicit bindings. */
export function mergeWorldPeople(live:SourcePerson[],state:{foundation?:WorldFoundation}):SourcePerson[] {
 const result=new Map(live.map(person=>[person.id,person]));
 for(const seed of state.foundation?.people??[]) {
  const previous=(seed.qqjPersonId?result.get(seed.qqjPersonId):undefined)??result.get(seed.id);
  if(seed.qqjPersonId&&seed.qqjPersonId!==seed.id)result.delete(seed.qqjPersonId);
  const owned=previous?.profileMaterialProvided===true;
  const selected=!owned||hasAcceptedSource(seed),fields=currentFoundationFields(seed,previous),short=foundationDescription(fields),manualIdentity=pinned(previous,identityFields);
  // The accepted short foundation is the model's source comparison; keep public fields as separate author reference.
  const publicDescription=previous?.profileReferenceDescription??(previous?.foundationFields?'':previous?.description??'');
  const profilePresentationSource=previous?.profilePresentationSource??previous?.presentationSource??{personality:'',relations:''};
  const personality=profilePresentationSource?.personality?.trim()?profilePresentationSource.personality:hasManualDisposition(previous)?profilePresentationSource?.personality??'':hasAcceptedSource(seed)?fields.disposition:'';
  const presentationSource={personality,relations:profilePresentationSource?.relations??''};
  const description=owned&&selected?[short,publicDescription?`千千结当前参考：\n${publicDescription}`:''].filter(Boolean).join('\n\n'):owned?publicDescription:short;
  result.set(seed.id,{...previous,id:seed.id,displayName:previous?.displayName??seed.name,aliases:previous?previous.aliases:seed.aliases,description,profileReferenceDescription:publicDescription,profilePresentationSource,presentationSource,identityDescription:selected&&!manualIdentity?fields.identity||previous?.identityDescription:previous?.identityDescription,identityCaption:selected&&!manualIdentity?fields.identity||previous?.identityCaption:previous?.identityCaption,identitySummary:selected&&!manualIdentity?fields.identity||previous?.identitySummary:previous?.identitySummary,specialRole:previous?.specialRole??seed.specialRole,qqjPersonId:seed.qqjPersonId??previous?.qqjPersonId,source:seed.sources[0]??previous?.source??{kind:'simulation',id:seed.establishedWindowId,label:'世界人物基础'},foundationFields:selected?fields:undefined});
 }
 return [...result.values()];
}
/** Current prose must not become historical truth; membership intervals retain actual changes only. */
export function foundationAsOf(foundation:WorldFoundation|undefined,before:Set<string>):WorldFoundation|undefined {
 if(!foundation)return undefined;
 const people=foundation.people.map(person=>before.has(person.currentStateWindowId)?person:{...person,...Object.fromEntries(foundationFields.map(key=>[key,'']))}) as FoundationPerson[];
 const groups=foundation.groups.filter(group=>before.has(group.establishedWindowId)).map(group=>({...group,description:before.has(group.currentStateWindowId)?group.description:'',members:group.members.filter(member=>before.has(member.fromWindowId)).map(member=>({...member,...(member.toWindowId&&!before.has(member.toWindowId)?{toWindowId:undefined}:{})})),...(group.endedWindowId&&!before.has(group.endedWindowId)?{endedWindowId:undefined}:{})}));
 const relations=foundation.relations.filter(row=>before.has(row.establishedWindowId)).map(row=>({...row,...(row.endedWindowId&&!before.has(row.endedWindowId)?{endedWindowId:undefined}:{})}));
 const context=foundation.context?.filter(row=>before.has(row.establishedWindowId)&&before.has(row.currentStateWindowId));
 return {...foundation,people,groups,relations,...(context?{context}:{})};
}

/** Only the supplied, effective foundation can support persistent author background. */
export function foundationReferences(foundation:WorldFoundation|undefined,events:WorldEvent[]) {
 const valid=new Set(events.filter(event=>!event.correction).map(event=>event.id));
 return (['people','groups','relations','context'] as const).flatMap((table,index)=>(foundation?.[table]??[]).flatMap(row=>{
  const basisEventIds=row.basisEventIds??[];
  if('endedWindowId'in row&&row.endedWindowId||basisEventIds.some(id=>!valid.has(id)))return [];
  const entityKind=['person','group','relation','context'][index],id=`foundation:${entityKind}:${row.id}`;
  return [{id,entityKind,entityId:row.id,label:'name'in row?row.name:'text'in row?'生活环境':`${row.fromRole} · ${row.toRole}`,basisEventIds}];
 }));
}
