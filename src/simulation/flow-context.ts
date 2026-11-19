import type {StoryInput} from '../application/contracts';
import type {SourcePerson} from '../domain/source-people';
import type {NpcWorldState} from '../domain/world-state';
import {foundationForInput,foundationReferences} from '../domain/world-foundation';
import {boundAtmospheres,socialContexts,type SocialContext} from '../domain/social-circles';
import type {DevelopmentAtmosphere,WorldEvent} from '../domain/world';
import {combineEmotions,emotionGuidance,readEmotion} from '../domain/emotion';
import {foundationSources,foundationPersonalityPendingPersonIds,foundationSupplementPersonIds} from './foundation';
import type {FlowFocus} from './flow-focus';

export function shortText(value: string, limit: number) {
  if (value.length <= limit) return value;
  const edge = Math.floor((limit - 1) / 2);
  return value.slice(0,edge).replace(/[\uD800-\uDBFF]$/u,'') + '…' + value.slice(-edge).replace(/^[\uDC00-\uDFFF]/u,'');
}

export function focusCircles(people: SourcePerson[], state: NpcWorldState, focus?: FlowFocus) {
  const circles = socialContexts(people, state);
  if (!focus) return circles;
  const ids = new Set(focus.personIds);
  const counts = circles.map(circle => ({circle,count:circle.personIds.filter(id => ids.has(id)).length}));
  return counts.filter(row => row.count > 0).sort((a,b) => Number(b.count > 1) - Number(a.count > 1)).slice(0,6).map(row => row.circle);
}

export function focusAtmospheres(people: SourcePerson[], state: NpcWorldState, circles?: SocialContext[]) {
  const rows = boundAtmospheres(people,state);
  if (!circles) return rows;
  const ids = new Set(circles.map(row => row.id));
  return rows.filter(row => row.circleRef && ids.has(row.circleRef));
}

export function circleEmotionContext(atmospheres: DevelopmentAtmosphere[]) {
  const byCircle = new Map<string,DevelopmentAtmosphere[]>();
  for (const row of atmospheres) {
    const rows = byCircle.get(row.circleRef!) ?? [];
    rows.push(row);
    byCircle.set(row.circleRef!, rows);
  }
  return [...byCircle].flatMap(([circleRef, rows]) => {
    const emotions = rows.flatMap(row => {const value = readEmotion(row.emotion);return value ? [value] : [];});
    const values = combineEmotions(emotions.map(emotion => emotion.values));
    return values ? [{circleRef,values,guidance:emotionGuidance({values,severity:emotions.some(emotion=>emotion.severity==='major')?'major':'ordinary',ongoing:emotions.some(emotion=>emotion.ongoing),throughSeq:null,stimulusRefs:[]})}] : [];
  });
}

export function flowPeople(people: SourcePerson[], focus?: FlowFocus) {
  const ids = focus && new Set(focus.personIds);
  return people.map(person => {
    const description = person.foundationFields ? person.profileReferenceDescription ?? '' : person.description;
    return {id:person.id,name:person.displayName,aliases:person.aliases,specialRole:person.specialRole,
      ...(!ids || ids.has(person.id) ? {description:focus ? shortText(description,650) : description} : {})};
  });
}

export function flowFoundation(input:{people:SourcePerson[];state:NpcWorldState;story:StoryInput}, options:{focus?:FlowFocus; circles?:SocialContext[]; worldSettings?:Parameters<typeof foundationSources>[1]; events:WorldEvent[]}) {
  const {people,state,story}=input;
  const {focus,circles,worldSettings,events}=options;
  const ids=focus && new Set(focus.personIds), groupIds=new Set((circles??[]).filter(row=>row.kind==='group').map(row=>row.entityId));
  const relationIds=new Set((circles??[]).filter(row=>row.kind==='relation').map(row=>row.entityId));
  const suppliedPeople = ids ? people.filter(p=>ids.has(p.id)) : people;
  const original=state.foundation;
  const narrowed=original && focus ? {...original,people:original.people.filter(row=>ids!.has(row.id)),groups:original.groups.filter(row=>groupIds.has(row.id)),relations:original.relations.filter(row=>relationIds.has(row.id)),context:original.context?.slice(-6)} : original;
  const foundation = foundationForInput(narrowed, people);
  const sources=foundationSources(suppliedPeople,worldSettings,story);
  return {
    foundation,
    foundationPendingPersonIds:foundationSupplementPersonIds(suppliedPeople,state),
    foundationPersonalityPendingPersonIds:foundationPersonalityPendingPersonIds(suppliedPeople,state),
    foundationSources:[...new Map([...sources.values()].map(ref=>[ref.id,ref])).values()],
    foundationReferences:foundationReferences(foundation,focus ? state.events : events),
    sources,
  };
}
