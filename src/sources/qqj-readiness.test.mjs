import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {createQQJReadinessReader}=await import('./qqj-readiness.ts');
function bridge(){let value={status:'ready',identity:{qqjChatId:'q'},readyThroughMessageIndex:2};const listeners=new Set(),requests=[];
 return{schemaVersion:1,kind:'qqj-public-memory-bridge',listeners,requests,getReadiness(input){requests.push(input);return value;},getSnapshot(){throw Error('no full snapshot');},subscribeReadiness(fn){listeners.add(fn);return()=>listeners.delete(fn);},emit(next=value){value=next;for(const fn of listeners)fn(value);}};
}
test('public readiness aligns QQJ identity and converts host zero-based indexes exactly once',()=>{
 const b=bridge(),reader=createQQJReadinessReader({getGlobals:()=>({qqj_v3_public_bridge_v1:b})});
 assert.equal(reader.read({scopeId:'q',afterSeq:1}).throughSeq,3);assert.deepEqual(b.requests,[{afterMessageIndex:0}]);assert.equal(reader.read({scopeId:'other',afterSeq:0}).status,'waiting');
 b.emit({status:'ready',identity:{qqjChatId:'q'},readyThroughMessageIndex:null});assert.equal(reader.read({scopeId:'q',afterSeq:1}).throughSeq,null);
 for(const value of [-1,2.5,'2',undefined]){b.emit({status:'ready',identity:{qqjChatId:'q'},readyThroughMessageIndex:value});assert.equal(reader.read({scopeId:'q',afterSeq:1}).status,'error');}
});
test('late bridge and replacement reconnect on ordinary events, isolate listeners and release both subscriptions',()=>{
 let current;const reader=createQQJReadinessReader({getGlobals:()=>({qqj_v3_public_bridge_v1:current})});let calls=0;const off=reader.subscribe(()=>calls++),bad=reader.subscribe(()=>{throw Error('listener');});assert.equal(calls,0);assert.equal(reader.read({scopeId:'q',afterSeq:0}).status,'unavailable');
 current=bridge();reader.reconnect();assert.equal(current.listeners.size,1);current.emit();assert.equal(calls,1);const old=current;current=bridge();reader.reconnect();assert.equal(old.listeners.size,0);old.emit();assert.equal(calls,1);current.emit();assert.equal(calls,2);off();bad();assert.equal(current.listeners.size,0);
});
test('missing, old, disabled and throwing QQJ bridges never provide a ready source',()=>{
 for(const current of [undefined,{schemaVersion:1,kind:'qqj-public-memory-bridge',getSnapshot(){throw Error('not allowed');}}, {...bridge(),getReadiness:()=>({status:'disabled'})},{...bridge(),getReadiness(){throw Error('unavailable');}}]){
  const reader=createQQJReadinessReader({getGlobals:()=>({qqj_v3_public_bridge_v1:current})});assert.notEqual(reader.read({scopeId:'q',afterSeq:0}).status,'ready');
 }
});
