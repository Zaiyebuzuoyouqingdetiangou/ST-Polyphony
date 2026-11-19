import type {SourcePerson} from '../domain/source-people';
import type {NpcWorldState} from '../domain/world-state';
import type {SourceRef,SimulationWindow} from '../domain/world';
import {CONSTRUCTION_REFERENCE_PREFIX,foundationFields,hasIndependentFoundationSource,hasManualDisposition,mergeWorldPeople,type FoundationPerson,type SocialGroup,type WorldRelation,type WorldFoundation} from '../domain/world-foundation';
import type {StoryInput,WorldSettings} from '../application/contracts';
import {asObject,list,newId,strings} from './trajectory';
import {decodeQQJPersonId} from '../sources/qqj-person-id';
import {mentionsName,narrativeEvidence,normalizedMention,uniqueStoryNames} from './story-evidence';
import {returnedIdentity} from './returned-identity';

export const PERSON_BINDING_INSTRUCTIONS='有明确依据确认同一人时，people只返一条，id沿已有底账，qqjPersonId用本次QQJ目录中对应人物的代号。同名、别名和共用书条只供核对。';

export const FOUNDATION_CONTRACT=`${PERSON_BINDING_INSTRUCTIONS}
foundation含people/groups/relations三个数组。people旧人用id，新实名人物用key/name/aliases及identity身份职责、motivations长期在意、disposition处事原则、interests兴趣、life生活约束五个简短块，未知留空。foundationPersonalityPendingPersonIds列自动性格待补人物；已有底账也须在本次正常foundation.people中尽力补disposition，复用本批资料，不索要额外请求。性格只引用本人档案、本人实际参与的已给有效经历，或确实出现本人姓名/唯一别名的引用正文；别人出场不能为本人背书。已有性格保主干，新行为明确揭示处事方式时就融入原简短性格，例如反复核账且主动指出多付，凝练为“核账细致，发现多付会直说”；字数保持紧凑，不逐轮重复扩写。当前情绪不等于长期性格，不按姓名、职业猜人格；未知可以暂空，无新依据沿用旧值，省略/空/坏返回不清除已有性格。QQJ人工性格字段含明确留空优先，不回写QQJ。性格和私密经历仅为作者人设约束，不向共享风向泄露个人心思或授予旁人知情。听的people从本次已给本人资料、正式正文或已存有效event id取据，同答新事件留到后续正常轮次再作性格依据；char/NPC同规则，不抄全档案，不输出NSFW/外貌栏目。资料中的未出场实名人物也可建，不按同名合并；未命名成员只留群说明，不造人物。groups每项id或key/name/description/members:[{personId,role可选}]，成员可引用同答people.key；为每个新群独立取名，先看成员长期相聚的实际缘由，从自己圈内的共同地点、活动、渊源或习惯找最有辨识度的线索。不照抄其他圈名的格式，不拼成员姓名，不用泛称、即兴情绪或当日事件充当名字；先按明确关系与共同工作、生活、长期往来形成圈，有稳定共同事由和真实联系即使尚未命名也可归纳；description简述纽带、相处方式、成员关切差异及已有约束。可重叠归属，不按char连接全部人合圈，同职业/同场/作者栏目不自动成群。已有圈重命名或细化说明沿旧id；只回新增或实际变化，未变省略沿用。relations每项id或key/fromPersonId/toPersonId/fromRole/toRole/directed；独立两人关系不必造群；群/关系与当前情绪分开，不自动知情。每个新增/变更项必须sourceIds选input.foundationSources.id，或sourceSeqs选本批正式正文，或basisEventIds选真实给过且有效事件。静态资料或有效既有经历的归纳可省新增断言，或assertedPersonIds:[]/assertsUser:false；显式stageKey须有效。正式本批正文事实用sourceSeqs；新的场外社会变化用有效basisEventIds及stageKey/assertedPersonIds/assertsUser，不能拿书源代替新事件。省略不删除；退群用members项status:"left"，解散群/结束关系用旧id/status:"ended"，保旧经历。输入members中toWindowId表示已经离开，endedWindowId表示群或关系已经结束，不能当当前有效关系。改变关系角色请结束旧id并用新key建立，不以旧id覆写角色。人工项不覆盖。不返回假来源；局部key只指本答真正声明的新项。`;
export function foundationSources(people:SourcePerson[],settings:WorldSettings|undefined,story:StoryInput) {
 const refs=new Map<string,SourceRef>();
 for(const person of people){refs.set(person.id,person.source);refs.set(person.source.id,person.source);}
 if(settings?.characterDescription)refs.set('character:current',{kind:'character',id:'character:current',label:'当前角色设定'});
 for(const book of settings?.books??[])for(const entry of book.entries){const id='world-book:'+JSON.stringify([book.name,entry.id]);refs.set(id,{kind:'world-book',id,label:book.name+(entry.comment?' · '+entry.comment:'')});}
 for(const turn of story.turns)if(turn.calibrationEligible!==false){const id='history-floor:'+turn.seq;refs.set(id,{kind:'chat',id,label:`第 ${turn.seq} 楼正文`});}
 return refs;
}
export function foundationSupplementPersonIds(people:SourcePerson[],state:NpcWorldState) {
 const windows=new Map((state.simulationRanges??[]).map(window=>[window.id,window]));
 const existing=new Map((state.foundation?.people??[]).map(person=>[person.id,person]));
 return people.filter(person=>{
  const row=existing.get(person.id);if(!row)return true;
  if(hasIndependentFoundationSource(row))return false;
  // Only a row's accepted reference checkpoint establishes that it was compared with the supplied material.
  return ![row.currentStateWindowId,row.establishedWindowId,...row.sources.filter(source=>source.kind==='simulation'&&source.id.startsWith(CONSTRUCTION_REFERENCE_PREFIX)).map(source=>source.id.slice(CONSTRUCTION_REFERENCE_PREFIX.length))].some(id=>windows.get(id)?.referenceSources!==undefined);
 }).map(person=>person.id);
}
export const needsFoundationSupplement=(people:SourcePerson[],state:NpcWorldState)=>!state.foundation||foundationSupplementPersonIds(people,state).length>0;
/** A personality gap asks the existing request to use its materials; it does not reopen all books. */
export function foundationPersonalityPendingPersonIds(people:SourcePerson[],state:NpcWorldState) {
 const known=new Map((state.foundation?.people??[]).map(person=>[person.id,person]));
 return people.filter(person=>!hasManualDisposition(person)&&!known.get(person.id)?.disposition?.trim()).map(person=>person.id);
}
export {foundationReferences} from '../domain/world-foundation';
function hasSeparatePersonRecord(state:NpcWorldState, providerId:string, stableId:string) {
 const foundation=state.foundation;
 return Boolean(
  foundation?.people.some(row=>row.id===providerId||row.id!==stableId&&row.qqjPersonId===providerId)
  ||foundation?.groups.some(row=>row.members.some(member=>member.personId===providerId))
  ||foundation?.relations.some(row=>row.fromPersonId===providerId||row.toPersonId===providerId)
  ||state.activities.some(row=>row.participantIds.includes(providerId))
  ||state.events.some(row=>row.participantIds.includes(providerId)||row.continuingForPersonIds?.includes(providerId)||row.activityChange?.participantIds?.includes(providerId))
  ||state.knowledge.some(row=>row.personId===providerId)
  ||state.developmentOnstagePersonIds?.includes(providerId)
  ||state.developmentRoutines?.some(row=>row.personId===providerId&&row.activeHours?.length)
  ||state.developmentArrangements?.some(row=>row.personId===providerId)
  ||state.developmentAtmospheres?.some(row=>row.personIds.includes(providerId))
  ||state.developmentPresentation?.some(row=>row.personId===providerId||Array.isArray(row.profileRelations?.items)
    &&row.profileRelations.items.some(edge=>edge.fromPersonId===providerId||edge.toPersonId===providerId))
 );
}

export function applyFoundation(input:{people:SourcePerson[];state:NpcWorldState;story:StoryInput;worldSettings?:WorldSettings},value:unknown,window:SimulationWindow,options:{construction?:boolean;static?:boolean;eventIds?:Set<string>;suppliedSources?:Map<string,SourceRef>;allows?:(row:Record<string,any>,ids:string[])=>boolean}={}) {
 const data=asObject(value);
 if(!data||!['people','groups','relations','context'].some(key=>Array.isArray(data[key])))throw new Error('世界基础资料无法读取，尚未保存，可重新世界构建。');
 const previous=input.state.foundation;
 const people=new Map((previous?.people??[]).map(row=>[row.id,row]));
 const groups=new Map((previous?.groups??[]).map(row=>[row.id,row]));
 const relations=new Map((previous?.relations??[]).map(row=>[row.id,row]));
 const context=new Map((previous?.context??[]).map(row=>[row.id,row]));
 const live=new Map(input.people.map(person=>[person.id,person]));
 const refs=new Map<string,string>(),knownSources=options.suppliedSources??foundationSources(input.people,input.worldSettings,input.story),events=new Map(input.state.events.filter(event=>options.eventIds?.has(event.id)).map(event=>[event.id,event]));
 if(options.construction)for(const source of window.referenceSources??[])knownSources.set(source.id,source);
 const eligible=new Set(input.story.turns.filter(turn=>turn.calibrationEligible!==false).map(turn=>turn.seq));
 const resolve=(id:unknown)=>typeof id==='string'?(refs.get(id)??id):'';
 const rejections:Array<{kind:string;key:string|null;reason:string}>=[];
 let accepted=0,submitted=0;
 const sourceFor=(row:Record<string,any>,old?:{sources:SourceRef[]})=>{
  // Construction records the supplied reference set, without claiming a particular book supports this row.
  if(!options.suppliedSources&&(options.construction||options.static)&&window.referenceSources?.length&&!['sourceIds','sources','sourceSeqs','basisEventIds'].some(key=>Object.hasOwn(row,key)))return [{kind:'simulation' as const,id:CONSTRUCTION_REFERENCE_PREFIX+window.id,label:'本次构筑参考资料'}];
  const result:SourceRef[]=[];
  const lookup=(id:string)=>knownSources.get(id)??(!options.suppliedSources?old?.sources.find(item=>item.id===id):undefined);
  const explicitIds=Object.hasOwn(row,'sourceIds')?strings(row.sourceIds):list(row.sources).flatMap(source=>{const ref=lookup(source.id);return ref&&source.kind===ref.kind?[source.id]:[];});
  for(const id of explicitIds){const ref=lookup(id);if(ref)result.push(ref);}
  for(const seq of Array.isArray(row.sourceSeqs)?row.sourceSeqs:[])if(eligible.has(seq))result.push({kind:'chat',id:'history-floor:'+seq,label:`第 ${seq} 楼正文`});
  for(const id of strings(row.basisEventIds)){const event=events.get(id);if(event&&!event.correction)result.push(...event.sources,{kind:'simulation',id:event.simulationWindowId??event.id,label:'已有经历依据'});}
  if(options.construction&&(!result.length||result.every(source=>source.kind==='plugin'))&&window.referenceSources?.length)result.push({kind:'simulation',id:CONSTRUCTION_REFERENCE_PREFIX+window.id,label:'本次构筑参考资料'});
  return [...new Map(result.map(source=>[source.kind+':'+source.id,source])).values()];
 };
 const allowed=(row:Record<string,any>,ids:string[],sources:SourceRef[])=>{
  const bodySource=(source:SourceRef|undefined)=>source?.kind==='chat'&&eligible.has(Number(source.id.slice('history-floor:'.length)));
  const explicitSources=Object.hasOwn(row,'sourceIds')?strings(row.sourceIds).map(id=>knownSources.get(id)):list(row.sources).flatMap(source=>{const known=knownSources.get(source.id);return known?.kind===source.kind?[known]:[];});
  if(options.construction||(Array.isArray(row.sourceSeqs)&&row.sourceSeqs.some(seq=>eligible.has(seq)))||explicitSources.some(bodySource))return true;
  const eventBacked=strings(row.basisEventIds).some(id=>events.has(id)&&!events.get(id)!.correction);
  const permit=(item:Record<string,any>,involved:string[])=>options.allows?.(item,involved)===true;
  if(!options.static)return eventBacked&&permit(row,ids);
  const knownSource=eventBacked||sources.some(source=>['plugin','character','world-book'].includes(source.kind)||source.kind==='simulation'&&source.id===CONSTRUCTION_REFERENCE_PREFIX+window.id);
  if(!knownSource)return false;
  const background=(!Object.hasOwn(row,'assertedPersonIds')||Array.isArray(row.assertedPersonIds)&&row.assertedPersonIds.length===0)&&(!Object.hasOwn(row,'assertsUser')||row.assertsUser===false);
  // Known social context can include onstage members; explicit stages still constrain empty assertions.
  if(background)return !Object.hasOwn(row,'stageKey')||permit({...row,assertedPersonIds:[],assertsUser:false},[]);
  return eventBacked&&permit(row,ids);
 };
 const basisFor=(row:Record<string,any>,old?:{basisEventIds?:string[]})=>[...new Set([...(old?.basisEventIds??[]),...strings(row.basisEventIds).filter(id=>events.has(id)&&!events.get(id)!.correction)])];
 const reject=(kind:string,row:Record<string,any>,reason:string)=>rejections.push({kind,key:typeof(row.id??row.key)==='string'?row.id??row.key:null,reason});
 const placeholder=(value:unknown)=>typeof value==='string'&&/^\s*<[^<>]+>\s*$/.test(value);
 const declaredKey=(value:unknown)=>typeof value==='string'&&Boolean(value.trim())&&!placeholder(value);
 const keyCounts=new Map<string,number>();
 if(options.construction)for(const table of ['people','groups','relations'])for(const row of list(data[table]))if(!Object.hasOwn(row,'id')&&declaredKey(row.key))keyCounts.set(row.key,(keyCounts.get(row.key)??0)+1);
 const ambiguous=(row:Record<string,any>)=>options.construction&&!Object.hasOwn(row,'id')&&(keyCounts.get(row.key)??0)>1;
 const manual=(old:{sources:SourceRef[]}|undefined)=>old?.sources.some(source=>source.kind==='manual');
 const names=uniqueStoryNames([
  ...input.people.map(person=>({id:person.id,names:[person.displayName,...person.aliases]})),
  ...[...people.values()].map(person=>({id:person.id,names:[person.name,...person.aliases]})),
 ]);
 const citedBody=new Map(input.story.turns.filter(turn=>eligible.has(turn.seq)).map(turn=>['history-floor:'+turn.seq,normalizedMention(narrativeEvidence(turn.text))]));
 const bookText=new Map((input.worldSettings?.books??[]).flatMap(book=>book.entries.map(entry=>['world-book:'+JSON.stringify([book.name,entry.id]),normalizedMention(entry.content)] as const)));
 const knownPeople=new Set([...live.keys(),...people.keys()]);
 const currentProvider=(value:unknown)=>{
  if(typeof value!=='string'||decodeQQJPersonId(value)?.qqjChatId!==input.state.scopeId)return undefined;
  return live.get(value);
 };
 const personRows=list(data.people).map(item=>{
  const row=returnedIdentity(item,knownPeople);
  const provider=currentProvider(row?.qqjPersonId);
  const bind=provider&&typeof row?.id==='string'&&row.id!==provider.id&&people.has(row.id);
  return {item,row,provider,bind};
 });
 const proposedBindings=personRows.filter(entry=>entry.bind);
 const acceptedBindings=new Map<string,string>();
 // Validate explicit pairs before a sibling can use the same provider ID as its own record.
 for(const {item,row,provider,bind} of [...proposedBindings,...personRows.filter(entry=>!entry.bind)]) {
  submitted++;if(!row){reject('person',item,'identity');continue;}
  if(ambiguous(row)){reject('person',row,'ambiguous-key');continue;}
  if(options.construction&&Object.hasOwn(row,'id')&&(typeof row.id!=='string'||!row.id.trim())){reject('person',row,'identity');continue;}
  if(row.qqjPersonId&&!provider){reject('person',row,'binding');continue;}
  const providedRef=typeof row.id==='string'?row.id:provider?.id;
  const canonical=providedRef?acceptedBindings.get(providedRef):undefined;
  const reference=canonical??providedRef;
  const old=reference?people.get(reference):undefined;
  const external=bind?provider:providedRef?live.get(providedRef):undefined;
  if(row.id&&!old&&!external){reject('person',row,'identity');continue;}
  if(bind&&provider&&old){
   if(provider.qqjPersonId!==provider.id||provider.source.kind!=='plugin'||provider.source.id!==provider.id){
    reject('person',row,'binding');continue;
   }
   const localRole=live.get(old.id)?.specialRole??old.specialRole;
   const conflictingRole=localRole&&provider.specialRole&&(localRole==='user')!==(provider.specialRole==='user');
   const conflictingPair=proposedBindings.some(entry=>entry.provider?.id===provider.id?entry.row?.id!==row.id:entry.row?.id===row.id);
   if(decodeQQJPersonId(old.id)||old.qqjPersonId&&old.qqjPersonId!==provider.id||conflictingRole||conflictingPair
    ||hasSeparatePersonRecord(input.state,provider.id,old.id)){
    reject('person',row,'binding-conflict');continue;
   }
  }
  const sources=sourceFor(row,canonical?undefined:old);
  const name=canonical?old?.name:typeof row.name==='string'&&row.name.trim()?row.name.trim():old?.name??external?.displayName;
  if(options.construction&&(placeholder(name)||!old&&!external&&!declaredKey(row.key))){reject('person',row,'fields');continue;}
  const involved=[...new Set([old?.id,external?.id].filter((id):id is string=>Boolean(id)))];
  if(!sources.length||!name||manual(old)||!row.id&&(!row.key||refs.has(row.key))||!allowed(row,involved,sources)){reject('person',row,'source-or-fields');continue;}
  const id=old?.id??external?.id??newId();
  const fields=Object.fromEntries(foundationFields.map(key=>{
   const oldValue=old?.[key]??'';
   if(canonical&&oldValue.trim())return [key,oldValue];
   const text=row[key];
   return [key,typeof text==='string'&&!(options.construction&&placeholder(text))?text.trim():oldValue];
  })) as unknown as Pick<FoundationPerson,typeof foundationFields[number]>;
  const oldDisposition=old?.disposition??'';
  if(hasManualDisposition(external)||!fields.disposition)fields.disposition=oldDisposition;
  if(fields.disposition!==oldDisposition){
   const aliases=[...names].filter(([,owner])=>owner===id).map(([name])=>name);
   const newName=normalizedMention(name);
   if(!old&&!external&&newName.length>=2&&!names.has(newName))aliases.push(newName);
   const namesPerson=(body:string|undefined)=>body!==undefined&&aliases.some(alias=>mentionsName(body,alias));
   const explicitIds=Object.hasOwn(row,'sourceIds')?strings(row.sourceIds):list(row.sources).map(source=>source.id);
   const profile=external?.profileReferenceDescription??(!external?.foundationFields?external?.description:undefined);
   const ownsProfile=external&&Boolean(profile?.trim())&&external.source.kind==='plugin'
    &&input.people.filter(person=>person.source.kind==='plugin'&&person.source.id===external.source.id).length===1
    &&explicitIds.some(id=>knownSources.get(id)?.id===external.source.id);
   const ownSource=ownsProfile||sources.some(source=>namesPerson(citedBody.get(source.id)??bookText.get(source.id))
    ||source.id==='character:current'&&namesPerson(normalizedMention(input.worldSettings?.characterDescription??'')));
   const ownExperience=strings(row.basisEventIds).some(id=>{const event=events.get(id);return event&&!event.correction&&event.participantIds.includes(old?.id??external?.id??'');});
   if(!ownSource&&!ownExperience){
    reject('person',row,'disposition-evidence');
    fields.disposition=oldDisposition;
    if(old&&Object.keys(row).every(key=>['id','key','disposition','sourceIds','sources','sourceSeqs','basisEventIds','stageKey','assertedPersonIds','assertsUser'].includes(key)))continue;
   }
  }
  const binding=old?.qqjPersonId??external?.qqjPersonId??(external&&decodeQQJPersonId(external.id)?external.id:undefined)??provider?.id;
  // A focused field update preserves the evidence behind the rest of the saved foundation.
  const comparedOwnProfile=options.static&&options.suppliedSources&&window.referenceSources&&external&&
    sources.every(source=>source.kind==='plugin')&&sources.some(source=>source.id===external.source.id)&&
    !old?.sources.some(source=>source.id.startsWith(CONSTRUCTION_REFERENCE_PREFIX));
  const boundThisAnswer=old?.qqjPersonId&&acceptedBindings.get(old.qqjPersonId)===old.id;
  const inherited=options.suppliedSources||bind||canonical||boundThisAnswer?old?.sources??[]:[];
  const checkpoint:SourceRef[] = comparedOwnProfile ? [{kind:'simulation',id:CONSTRUCTION_REFERENCE_PREFIX+window.id,label:'本轮已核对人物参考资料'}] : [];
  const carriedSources=[...new Map([...inherited,...sources,...checkpoint].map(source=>[source.kind+':'+source.id,source])).values()];
  const aliases=Array.isArray(row.aliases)?strings(row.aliases):old?.aliases??external?.aliases??[];
  people.set(id,{id,name,aliases:canonical?[...new Set([...(old?.aliases??[]),...aliases])]:aliases,...fields,...(binding?{qqjPersonId:binding}:{}),...(external?.specialRole?{specialRole:external.specialRole}:old?.specialRole?{specialRole:old.specialRole}:{}),sources:carriedSources,basisEventIds:basisFor(row,old),establishedWindowId:old?.establishedWindowId??window.id,currentStateWindowId:window.id});
  if(bind&&provider){acceptedBindings.set(provider.id,id);refs.set(provider.id,id);}
  if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 const ids=new Set([...live.keys(),...people.keys()]);
 for(const item of list(data.groups)) {
  submitted++;const row=returnedIdentity(item,groups);if(!row){reject('group',item,'identity');continue;}
  if(ambiguous(row)){reject('group',row,'ambiguous-key');continue;}
  const old=typeof row.id==='string'?groups.get(row.id):undefined,sources=sourceFor(row,old);
  if(options.construction&&(Object.hasOwn(row,'id')&&(typeof row.id!=='string'||!row.id.trim())||!old&&!declaredKey(row.key)||placeholder(row.name))){reject('group',row,'identity');continue;}
  const members=list(row.members).filter(member=>{if(!(options.construction||options.static)||ids.has(resolve(member.personId)))return true;reject('group-member',row,'identity');return false;}),memberIds=members.map(member=>resolve(member.personId));
  const involved=row.status==='ended'?(old?.members.filter(member=>!member.toWindowId).map(member=>member.personId)??memberIds):memberIds;
  if(row.id&&!old||manual(old)||!sources.length||memberIds.some(id=>!ids.has(id))||!allowed(row,involved,sources)){reject('group',row,'source-or-identity');continue;}
  if(row.status==='ended'){if(old){groups.set(old.id,{...old,endedWindowId:old.endedWindowId??window.id,sources,basisEventIds:basisFor(row,old)});accepted++;}else reject('group',row,'identity');continue;}
  if(!old&&(!row.key||refs.has(row.key)||typeof row.name!=='string'||!row.name.trim()||!Array.isArray(row.members)&&!(options.construction&&typeof row.description==='string'&&row.description.trim()))){reject('group',row,'fields');continue;}
  const nextMembers=(old?.members??[]).map(member=>({...member}));
  members.forEach((member,index)=>{const personId=memberIds[index],active=nextMembers.find(m=>m.personId===personId&&!m.toWindowId);if(member.status==='left'){if(active)active.toWindowId=window.id;}else if(active){if(typeof member.role==='string'&&active.role!==member.role){active.toWindowId=window.id;nextMembers.push({personId,role:member.role,fromWindowId:window.id});}}else nextMembers.push({personId,...(typeof member.role==='string'?{role:member.role}:{}),fromWindowId:window.id});});
  const id=old?.id??newId();groups.set(id,{...old,id,name:typeof row.name==='string'?row.name.trim():old!.name,description:typeof row.description==='string'?row.description:old?.description??'',members:nextMembers,sources,basisEventIds:basisFor(row,old),establishedWindowId:old?.establishedWindowId??window.id,currentStateWindowId:window.id});if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 for(const item of list(data.relations)) {
  submitted++;const row=returnedIdentity(item,relations);if(!row){reject('relation',item,'identity');continue;}
  if(ambiguous(row)){reject('relation',row,'ambiguous-key');continue;}
  const old=typeof row.id==='string'?relations.get(row.id):undefined,sources=sourceFor(row,old),from=resolve(row.fromPersonId??old?.fromPersonId),to=resolve(row.toPersonId??old?.toPersonId);
  if(options.construction&&(Object.hasOwn(row,'id')&&(typeof row.id!=='string'||!row.id.trim())||!old&&!declaredKey(row.key))){reject('relation',row,'identity');continue;}
  if(row.id&&!old||manual(old)||!sources.length||!ids.has(from)||!ids.has(to)||from===to||!allowed(row,[from,to],sources)){reject('relation',row,'source-or-identity');continue;}
  if(row.status==='ended'){if(old){relations.set(old.id,{...old,endedWindowId:old.endedWindowId??window.id,sources,basisEventIds:basisFor(row,old)});accepted++;}else reject('relation',row,'identity');continue;}
  const fromRole=typeof row.fromRole==='string'&&!(options.construction&&placeholder(row.fromRole))?row.fromRole.trim():'',toRole=typeof row.toRole==='string'&&!(options.construction&&placeholder(row.toRole))?row.toRole.trim():'';
  if(!old&&(!row.key||refs.has(row.key)||(options.construction?!fromRole&&!toRole:!fromRole||!toRole))){reject('relation',row,'fields');continue;}
  // A changed role is a new relation with its own interval, not a rewrite of the old edge.
  const id=old?.id??newId();relations.set(id,old??{id,fromPersonId:from,toPersonId:to,fromRole,toRole,directed:row.directed===true,sources,basisEventIds:basisFor(row,old),establishedWindowId:window.id});if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 for(const item of list(data.context)) {
  submitted++;const row=returnedIdentity(item,context);if(!row){reject('context',item,'identity');continue;}
  const old=typeof row.id==='string'?context.get(row.id):undefined,sources=sourceFor(row,old);
  if(row.id&&!old||manual(old)||typeof row.text!=='string'||!row.text.trim()||options.construction&&placeholder(row.text)||!sources.length||!allowed(row,[],sources)){reject('context',row,'source-or-fields');continue;}
  const id=old?.id??newId();context.set(id,{id,text:row.text.trim(),sources,basisEventIds:basisFor(row,old),establishedWindowId:old?.establishedWindowId??window.id,currentStateWindowId:window.id});accepted++;
 }
 if(options.construction&&submitted&&!accepted)throw new Error('本次世界基础资料的来源或归属未能确认，尚未保存，可重新世界构建。');
 const foundation:WorldFoundation={throughSeq:input.story.throughSeq??0,windowId:options.construction?window.id:previous?.windowId??window.id,people:[...people.values()],groups:[...groups.values()],relations:[...relations.values()],...(context.size||previous?.context?{context:[...context.values()]}:{})};
 return {foundation,people:mergeWorldPeople(input.people,{foundation}),refs,accepted,submitted,rejections};
}
