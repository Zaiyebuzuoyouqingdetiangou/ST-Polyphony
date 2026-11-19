import type {StoryTurn} from '../application/contracts';
import type {SourcePerson} from '../domain/source-people';
import type {NpcWorldState} from '../domain/world-state';
import {isEffectiveEvent} from '../domain/world-facts';
import {storyMinutes} from '../host/story-clock';
import {developmentGate} from './life-rhythm';
import {matterTerms} from './life-materials';
import {savedStoryClock,savedWindowChain} from './trajectory';
import {mentionsName,narrativeEvidence,normalizedMention,uniqueStoryNames} from './story-evidence';
import {historyFactSeqs} from './fact-sources';

export interface FlowFocus {
  personIds: string[];
  activityIds: string[];
  mentionedActivityIds: string[];
  completedActivityIds: string[];
  mentions: Array<{personId: string; sourceSeqs: number[]}>;
  everyday: Array<{personId: string}>;
}

/** These are leads for the current request. The same model answer still owns scene and intent. */
export function selectFlowFocus(people: SourcePerson[], state: NpcWorldState, turns: StoryTurn[], endClock: string | null, cameraIds: string[] = []): FlowFocus {
  const processed = state.processedThroughSeq ?? 0;
  const fresh = turns.filter(turn => turn.calibrationEligible !== false && turn.seq > processed);
  const bodies = fresh.map(turn => ({seq: turn.seq, text: normalizedMention(narrativeEvidence(turn.text))}));
  const possibleNames=uniqueStoryNames(people.map(person=>({id:person.id,names:[person.displayName,...person.aliases]})));
  const hits = new Map<string, Set<number>>();
  for (const [name, id] of possibleNames) if (id) for (const body of bodies) if (mentionsName(body.text, name)) {
    const seqs = hits.get(id) ?? new Set<number>();
    seqs.add(body.seq);
    hits.set(id, seqs);
  }
  const seqs = new Set(fresh.map(turn => turn.seq));
  const factualActivityIds = new Set<string>();
  const effective = state.events.filter(isEffectiveEvent);
  const priorParticipants = new Set<string>();
  for (const event of effective) {
    const floors = historyFactSeqs(event);
    if (floors.every(seq => seq <= processed)) for (const id of event.participantIds) priorParticipants.add(id);
    const current = floors.filter(seq => seqs.has(seq));
    if (!current.length) continue;
    if (event.activityId) factualActivityIds.add(event.activityId);
    for (const id of event.participantIds) hits.set(id, new Set([...(hits.get(id) ?? []), ...current]));
  }

  const directory = new Map(people.map(person => [person.id, person]));
  const protectedIds = new Set([...(state.developmentOnstagePersonIds ?? []), ...cameraIds, ...people.filter(person => person.specialRole === 'user').map(person => person.id)]);
  const active = new Map(people.filter(person => !protectedIds.has(person.id)).map(person => [person.id, developmentGate(state, [person], endClock)]));
  const start = storyMinutes(savedStoryClock(state)), end = storyMinutes(endClock);
  const newActiveArrangements = new Set((state.developmentArrangements ?? []).filter(row => {
    const from = storyMinutes(row.from), to = storyMinutes(row.to);
    return start !== null && end !== null && from !== null && to !== null && row.kind === 'active'
      && row.sourceSeqs?.length && start < from && from <= end && to > from;
  }).map(row => row.personId));
  const mentionedMatter = (row: NpcWorldState['activities'][number]) =>
    factualActivityIds.has(row.id) || matterTerms(row).some(term=>bodies.some(body=>mentionsName(body.text,term)));
  const open = state.activities.filter(row => row.status !== 'completed');
  const windows = savedWindowChain(state) ?? [];
  const knownWindows = new Map(windows.map(row=>[row.id,row.throughSeq]));
  const hearings = [...new Set(windows.filter(row=>!row.referenceSources&&!row.purpose&&row.throughSeq<=processed).map(row=>row.throughSeq))];
  const lastProgress = new Map<string,number>();
  for(const event of effective)if(event.activityId){
    const floor=Math.max(0,...historyFactSeqs(event),knownWindows.get(event.simulationWindowId??'')??0);
    if(floor>0&&floor<=processed)lastProgress.set(event.activityId,Math.max(floor,lastProgress.get(event.activityId)??0));
  }
  const stalled=(row:NpcWorldState['activities'][number])=>{
    const last=Math.max(lastProgress.get(row.id)??0,knownWindows.get(row.currentStateWindowId??'')??0);
    return row.status==='active' && last>0 && hearings.filter(seq=>seq>last).length>=3;
  };
  const mentionedActivityIds = new Set(open.filter(mentionedMatter).map(row => row.id));
  const topical = open.filter(row => mentionedActivityIds.has(row.id) || row.participantIds.some(id => hits.has(id) || newActiveArrangements.has(id)));
  const topicalIds = new Set(topical.map(row => row.id));
  const advancing = open.filter(row => !topicalIds.has(row.id) && row.status !== 'waiting' && !stalled(row) && row.participantIds.some(id => active.get(id)?.generate)).slice(-2);
  const matters = [...topical, ...advancing];
  const focused = new Set([...hits.keys(), ...matters.flatMap(row => row.participantIds)]);
  const openIds = new Set(open.map(row => row.id));
  const recentDuty = new Set(effective.filter(event => !event.activityId || !openIds.has(event.activityId)).slice(-12).flatMap(event => event.participantIds));
  const waitingPeople = new Set(open.filter(row => row.status==='waiting').flatMap(row => row.participantIds));
  const available = people.filter(person => active.get(person.id)?.generate);
  const establishedIds = new Set(available.filter(person => priorParticipants.has(person.id)
    || person.foundationFields?.life?.trim() || person.foundationFields?.interests?.trim()
    || person.manualProfile?.likes?.trim() || person.source.kind !== 'chat' && person.identityDescription?.trim()).map(person => person.id));
  const opportunities = available.filter(person => {
    const gate = active.get(person.id);
    return gate?.reason === 'active-interval' || gate?.reason === 'temporary-active' || recentDuty.has(person.id);
  });
  const opportunityIds = new Set(opportunities.map(person => person.id));
  const profileOnly = available.filter(person => establishedIds.has(person.id) && !opportunityIds.has(person.id)
    && !focused.has(person.id) && !waitingPeople.has(person.id));
  // A quiet hearing still gives someone else the next opportunity.
  const rotate = (rows: SourcePerson[]) => {
    rows.sort((a,b) => a.id.localeCompare(b.id));
    const start = rows.length ? hearings.length % rows.length : 0;
    return [...rows.slice(start), ...rows.slice(0, start)];
  };
  const everyday = [
    ...rotate(opportunities.filter(person => establishedIds.has(person.id))),
    ...rotate(profileOnly),
    ...rotate(opportunities.filter(person => !establishedIds.has(person.id))),
  ].slice(0, 3).map(person => ({personId: person.id}));
  for (const {personId} of everyday) focused.add(personId);
  return {
    personIds: [...focused].filter(id => directory.has(id)),
    activityIds: matters.map(row => row.id),
    mentionedActivityIds: [...mentionedActivityIds],
    completedActivityIds: state.activities.filter(row => row.status === 'completed' && mentionedMatter(row)).map(row => row.id),
    mentions: [...hits].filter(([id]) => directory.has(id)).map(([personId, sourceSeqs]) => ({personId, sourceSeqs: [...sourceSeqs]})),
    everyday,
  };
}
