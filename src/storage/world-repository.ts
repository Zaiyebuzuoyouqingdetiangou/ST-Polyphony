import type { WorldRepository } from '../application/contracts';
import type { NpcWorldState } from '../domain/world-state';
import { createEmptyState } from '../domain/world-state';
import { createBainiaoClient } from './bainiao-client';
import type {FoundationContext} from '../domain/world-foundation';

/** Optional environment records are independent; damaged rows do not turn a readable world into an outage. */
function readableContext(value:unknown):FoundationContext[]|undefined {
  if(!Array.isArray(value))return undefined;
  return value.flatMap(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||!['id','text','establishedWindowId','currentStateWindowId'].every(key=>typeof row[key]==='string'&&row[key].trim())||!Array.isArray(row.sources))return [];
    return [{id:row.id,text:row.text,establishedWindowId:row.establishedWindowId,currentStateWindowId:row.currentStateWindowId,sources:row.sources.filter((source:any)=>source&&['character','world-book','chat','manual','plugin','simulation'].includes(source.kind)&&typeof source.id==='string'&&typeof source.label==='string'),...(Array.isArray(row.basisEventIds)?{basisEventIds:row.basisEventIds.filter((id:unknown)=>typeof id==='string')}: {})}];
  });
}

export function createWorldRepository(client = createBainiaoClient()): WorldRepository {
  const collection = (scopeId: string) => `npc-world-${scopeId}`;
  const recordId = 'world';
  return {
    async load(scopeId) {
      const envelope = await client.get(collection(scopeId), recordId) as { data?: unknown; revision?: unknown } | null;
      if (!envelope) return null;
      if (!Number.isInteger(envelope.revision) || !envelope.data || typeof envelope.data !== 'object') throw new Error('百面相世界记录格式无法读取。');
      let state = envelope.data as NpcWorldState;
      if (state.schemaVersion !== 1 || state.scopeId !== scopeId || !Array.isArray(state.activities) || !Array.isArray(state.events) || !Array.isArray(state.knowledge)) throw new Error('百面相世界记录与当前聊天不匹配。');
      if(state.foundation&&(!Array.isArray(state.foundation.people)||!Array.isArray(state.foundation.groups)||!Array.isArray(state.foundation.relations)))throw new Error('百面相世界基础资料格式无法读取。');
      if(state.foundation&&Object.hasOwn(state.foundation,'context')){
        const {context:rawContext,...foundation}=state.foundation,context=readableContext(rawContext);
        state={...state,foundation:{...foundation,...(context?{context}:{})}};
      }
      return { state, revision: Number(envelope.revision) };
    },
    async save(scopeId, state, expectedRevision, diagnostic) {
      if (state.scopeId !== scopeId) throw new Error('百面相世界记录与当前聊天不匹配。');
      const saved = await client.put(collection(scopeId), recordId, state, expectedRevision ?? 0, diagnostic) as { data?: unknown; revision?: unknown };
      return { state: (saved.data && typeof saved.data === 'object' ? saved.data : state) as NpcWorldState, revision: Number(saved.revision ?? ((expectedRevision ?? -1) + 1)) };
    },
  };
}
