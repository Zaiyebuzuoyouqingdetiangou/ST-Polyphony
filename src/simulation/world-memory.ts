import type {NpcWorldState} from '../domain/world-state';
import type {SourcePerson} from '../domain/source-people';
import {isEffectiveEvent} from '../domain/world-facts';
import {buildPersonContexts} from './person-context';
import {effectiveAtmospheres} from '../domain/world-state';
import type {WorldEvent} from '../domain/world';
import type {FlowFocus} from './flow-focus';
import {historyFactSeqs} from './fact-sources';
import type {SocialContext} from '../domain/social-circles';

export type SuppliedMemory = Pick<NpcWorldState,'activities'|'events'|'knowledge'>;

/** Ordinary flow takes progress and direct evidence. Merely sharing an activity never pulls its history. */
export function selectFlowMemory(state: NpcWorldState, focus: FlowFocus, circles: SocialContext[]): SuppliedMemory {
 const personIds=new Set(focus.personIds),activityIds=new Set(focus.activityIds);
 const groupIds=new Set(circles.filter(circle=>circle.kind==='group').map(circle=>circle.entityId));
 const relationIds=new Set(circles.filter(circle=>circle.kind==='relation').map(circle=>circle.entityId));
 const openIds=new Set(state.activities.filter(row=>row.status!=='completed').map(row=>row.id));
 const eventById=new Map(state.events.map(event=>[event.id,event]));
 const latestProgress=new Map<string,WorldEvent>(),latestByPerson=new Map<string,WorldEvent[]>();
 const factsByPerson=new Map<string,WorldEvent>(),correctionByPerson=new Map<string,WorldEvent>();
 const knownByPerson=new Map<string,WorldEvent>();
 const wanted=new Set<string>();
 const involved=(event:WorldEvent)=>new Set([...event.participantIds,...(event.continuingForPersonIds??[])]);
 for(const event of state.events){
  if(event.activityId&&activityIds.has(event.activityId)&&isEffectiveEvent(event))latestProgress.set(event.activityId,event);
  for(const id of involved(event))if(personIds.has(id)){
   if(event.correction){correctionByPerson.set(id,event);continue;}
   if(historyFactSeqs(event).length)factsByPerson.set(id,event);
   if(event.activityId&&openIds.has(event.activityId))continue;
   const recent=latestByPerson.get(id)??[];
   recent.push(event);
   if(recent.length>2)recent.shift();
   latestByPerson.set(id,recent);
  }
 }
 for(const row of state.knowledge)if(personIds.has(row.personId)&&row.correction?.treatment!=='invalidated'){
  const value=eventById.get(row.eventId);
  if(value&&(!value.activityId||!openIds.has(value.activityId)||activityIds.has(value.activityId)))knownByPerson.set(row.personId,value);
 }
 for(const row of latestProgress.values())wanted.add(row.id);
 for(const rows of latestByPerson.values())for(const row of rows)wanted.add(row.id);
 for(const rows of [factsByPerson,correctionByPerson,knownByPerson])for(const row of rows.values())wanted.add(row.id);
 // Keep the witnesses for relationships and short foundations supplied with this focus.
 for(const row of state.foundation?.people??[])if(personIds.has(row.id))for(const id of row.basisEventIds??[])wanted.add(id);
 for(const row of state.foundation?.groups??[])if(groupIds.has(row.id))for(const id of row.basisEventIds??[])wanted.add(id);
 for(const row of state.foundation?.relations??[])if(relationIds.has(row.id))for(const id of row.basisEventIds??[])wanted.add(id);
 for(const row of (state.foundation?.context??[]).slice(-6))for(const id of row.basisEventIds??[])wanted.add(id);
 for(const id of [...wanted]){
  const links=eventById.get(id)?.eventLinks??[];
  const cause=links.find(link=>link.kind==='caused-by')??links.find(link=>link.kind==='continues');
  if(cause&&eventById.has(cause.eventId))wanted.add(cause.eventId);
 }
 const correctionByEvent=new Map<string,Set<string>>();
 for(const row of state.knowledge)if(row.correction){
  const refs=correctionByEvent.get(row.eventId)??new Set<string>();refs.add(row.correction.byEventId);correctionByEvent.set(row.eventId,refs);
 }
 // A corrected claim keeps its actual replacement and the disposition of everyone who knew it.
 for(const id of wanted){
  const refs=[eventById.get(id)?.correction?.byEventId,...(correctionByEvent.get(id)??[])];
  for(const ref of refs)if(ref&&eventById.has(ref))wanted.add(ref);
 }
 const events=state.events.filter(row=>wanted.has(row.id));
 const pastActivityIds=new Set(events.map(event=>event.activityId));
 const completedIds=new Set(focus.completedActivityIds);
 const backgroundIds=new Set<string>();
 const detailedParticipants=new Set(state.activities.filter(row=>activityIds.has(row.id)).flatMap(row=>row.participantIds));
 for(const {personId} of focus.everyday)if(!detailedParticipants.has(personId)){
  const previous=state.activities.findLast(row=>openIds.has(row.id)&&row.participantIds.includes(personId));
  if(previous)backgroundIds.add(previous.id);
 }
 const activityWithEvent=new Set(state.events.filter(isEffectiveEvent).map(event=>event.activityId));
 const order=new Map((state.simulationRanges??[]).map((window,index)=>[window.id,index]));
 const checkpoints=state.activities.filter(row=>row.status==='completed'&&!activityWithEvent.has(row.id))
   .sort((a,b)=>(order.get(a.currentStateWindowId??'')??-1)-(order.get(b.currentStateWindowId??'')??-1));
 const latestCheckpoint=new Map<string,string>();
 for(const row of checkpoints)for(const id of row.participantIds)if(personIds.has(id))latestCheckpoint.set(id,row.id);
 for(const id of latestCheckpoint.values())completedIds.add(id);
 return {
  activities:state.activities.filter(row=>activityIds.has(row.id)||backgroundIds.has(row.id)||completedIds.has(row.id)||row.status==='completed'&&pastActivityIds.has(row.id)),
  events,
  knowledge:state.knowledge.filter(row=>wanted.has(row.eventId)),
 };
}

/** A request view only: apply and persistence always keep the complete world authority. */
export function selectWorldMemory(people:SourcePerson[],state:NpcWorldState) {
 const eventById=new Map(state.events.map(event=>[event.id,event]));
 const resultActivities=new Set(state.events.filter(isEffectiveEvent).map(event=>event.activityId));
 const active=new Set(state.activities.filter(activity=>activity.status!=='completed').map(activity=>activity.id));
 // Recent factual completions without events still need their own identity and checkpoint.
 const windowOrder=new Map((state.simulationRanges??[]).map((window,index)=>[window.id,index]));
 const completions=state.activities.filter(activity=>activity.status==='completed'&&!resultActivities.has(activity.id)).sort((a,b)=>(windowOrder.get(a.currentStateWindowId??'')??-1)-(windowOrder.get(b.currentStateWindowId??'')??-1));
 for(const person of people)for(const activity of completions.filter(activity=>activity.participantIds.includes(person.id)).slice(-4))active.add(activity.id);
 for(const activity of completions.filter(activity=>!activity.participantIds.length).slice(-8))active.add(activity.id);
 const wanted=new Set<string>(),byActivity=new Map<string,string[]>(),byPerson=new Map<string,string[]>();
 for(const row of effectiveAtmospheres(state))for(const id of row.basisEventIds)wanted.add(id);
 for(const row of [...(state.foundation?.people??[]),...(state.foundation?.groups??[]),...(state.foundation?.relations??[]),...(state.foundation?.context??[])])for(const id of row.basisEventIds??[])wanted.add(id);
 for(const event of state.events) {
  if(event.activityId){const rows=byActivity.get(event.activityId)??[];rows.push(event.id);byActivity.set(event.activityId,rows);}
  if(isEffectiveEvent(event))for(const id of event.participantIds){const rows=byPerson.get(id)??[];rows.push(event.id);byPerson.set(id,rows);}
  if(event.activityId&&active.has(event.activityId)||event.continuingForPersonIds?.length)wanted.add(event.id);
 }
 const knowledgeByPerson=new Map<string,NpcWorldState['knowledge']>();
 for(const row of state.knowledge){const rows=knowledgeByPerson.get(row.personId)??[];rows.push(row);knowledgeByPerson.set(row.personId,rows);}
 for(const person of people){for(const id of (byPerson.get(person.id)??[]).slice(-4))wanted.add(id);for(const row of (knowledgeByPerson.get(person.id)??[]).slice(-4))wanted.add(row.eventId);}
 for(const row of state.events.filter(event=>!event.participantIds.length&&isEffectiveEvent(event)).slice(-8))wanted.add(row.id);
 const knowledgeByEvent=new Map<string,NpcWorldState['knowledge']>();
 for(const row of state.knowledge){const rows=knowledgeByEvent.get(row.eventId)??[];rows.push(row);knowledgeByEvent.set(row.eventId,rows);}
 const queue=[...wanted];
 const add=(id:string|undefined)=>{if(id&&eventById.has(id)&&!wanted.has(id)){wanted.add(id);queue.push(id);}};
 for(let index=0;index<queue.length;index++) {
  const event=eventById.get(queue[index]);if(!event)continue;
  for(const link of event.eventLinks??[])add(link.eventId);
  add(event.correction?.byEventId);
  if(event.activityId){active.add(event.activityId);for(const id of byActivity.get(event.activityId)??[])add(id);}
  for(const row of knowledgeByEvent.get(event.id)??[])add(row.correction?.byEventId);
 }
 const events=state.events.filter(row=>wanted.has(row.id)),knowledge=state.knowledge.filter(row=>wanted.has(row.eventId));
 const projected={...state,activities:state.activities.filter(row=>active.has(row.id)),events,knowledge};
 return {...projected,...buildPersonContexts(people,projected)};
}
