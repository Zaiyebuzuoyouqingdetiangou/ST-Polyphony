import {recordBody,type Activity,type Person,type SourceRef,type WorldEvent,type WorldSnapshot} from '../domain/world';
import {isEffectiveEvent} from '../domain/world-facts';
import {factEvidenceKind} from '../simulation/fact-sources';

export interface HearingActivity {activity:Activity;people:Person[];latestProgress:WorldEvent|null;body:string;earlierProgress:Array<{id:string;body:string}>}
const phaseOrder:Record<Activity['status'],number>={active:0,waiting:1,planned:2,completed:3};
/** Only the display body receives a missing stop; canonical activity/event text stays untouched. */
function sentenceBody(value:string):string {const text=value.trimEnd();return !text||/[。！？.!?…][”’"'」』）》】)\]}]*$/u.test(text)?text:text+'。';}
/** Navigation and hearing share card visibility without changing the saved facts. */
export function visibleHearingActivities(world:Pick<WorldSnapshot,'activities'|'developmentOnstagePersonIds'>):Activity[] {
  const onstage=new Set(world.developmentOnstagePersonIds??[]);
  return world.activities.filter(activity=>activity.status==='completed'||!activity.participantIds.length||activity.participantIds.some(id=>!onstage.has(id)));
}
/** Event order follows the saved world, including facts explicitly linked by a hearing window. */
export function hearingActivities(world:WorldSnapshot):HearingActivity[] {
  const windowId=world.lastHearingWindow?.id,checkpoints=world.lastHearingWindow?.checkpointActivityIds;
  const updated=new Set(Array.isArray(checkpoints)?checkpoints:[]);
  const fromWindow=(explicit:string|undefined,sources:SourceRef[])=>windowId!==undefined&&(explicit?explicit===windowId:sources.some(source=>source.kind==='simulation'&&source.id===windowId));
  const byActivity=new Map<string,WorldEvent[]>();
  for(const event of world.events){
    if(!event.activityId||!isEffectiveEvent(event))continue;
    const kind=factEvidenceKind(event,world.id??'');
    if(kind!=='prior-generated'&&!(kind==='body-fact'&&event.simulationWindowId))continue;
    if(recordBody(event).trim()&&fromWindow(event.simulationWindowId,event.sources))updated.add(event.activityId);
    const events=byActivity.get(event.activityId);
    if(events)events.push(event);
    else byActivity.set(event.activityId,[event]);
  }
  const rows=visibleHearingActivities(world).map(activity=>{
    if(fromWindow(activity.currentStateWindowId,activity.sources))updated.add(activity.id);
    const progress=byActivity.get(activity.id)??[];
    const latestProgress=progress.at(-1)??null;
    const earlierProgress=progress.slice(0,-1).reverse().flatMap(event=>{
      const body=sentenceBody(recordBody(event));
      return body?[{id:event.id,body}]:[];
    });
    return {activity,people:world.people.filter(p=>activity.participantIds.includes(p.id)),latestProgress,body:sentenceBody(recordBody(latestProgress??activity)),earlierProgress};
  });
  return rows.sort((a,b)=>Number(updated.has(b.activity.id))-Number(updated.has(a.activity.id))
    ||(phaseOrder[a.activity.status]??4)-(phaseOrder[b.activity.status]??4));
}
