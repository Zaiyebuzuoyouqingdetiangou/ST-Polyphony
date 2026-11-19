import type {StoryReadinessReader} from '../application/contracts';
import {getHostContext} from '../host/host-context';

type Bridge={schemaVersion:1;kind:'qqj-public-memory-bridge';getReadiness(input:{afterMessageIndex:number}):unknown;subscribeReadiness(listener:()=>void):()=>void};
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;

export function currentQQJScope():string|null {
  const context=getHostContext();
  const hostId=String(context?.chatId??(typeof context?.getCurrentChatId==='function'?context.getCurrentChatId():'')??'').trim();
  if(!hostId)return null;
  try{
    const bridge=record((globalThis as {qqj_v3_public_bridge_v1?:unknown}).qqj_v3_public_bridge_v1);
    if(bridge?.schemaVersion!==1||bridge.kind!=='qqj-public-memory-bridge'||typeof bridge.getStatus!=='function')return null;
    const status=record(bridge.getStatus()),identity=record(status?.identity);
    return status?.status==='ready'&&identity?.hostChatId===hostId&&typeof identity.qqjChatId==='string'&&identity.qqjChatId?identity.qqjChatId:null;
  }catch{return null;}
}

export function createQQJReadinessReader({getGlobals=()=>globalThis as {qqj_v3_public_bridge_v1?:unknown}}={}):StoryReadinessReader {
  const listeners=new Set<()=>void>();
  let connected:Bridge|null=null,unsubscribe:(()=>void)|undefined;
  function reconnect(){
    const candidate=record(getGlobals().qqj_v3_public_bridge_v1);
    const bridge=candidate?.schemaVersion===1&&candidate.kind==='qqj-public-memory-bridge'&&typeof candidate.getReadiness==='function'&&typeof candidate.subscribeReadiness==='function'?candidate as Bridge:null;
    if(bridge===connected&&(!listeners.size||unsubscribe))return;
    unsubscribe?.();unsubscribe=undefined;connected=bridge;
    if(bridge&&listeners.size)try{unsubscribe=bridge.subscribeReadiness(()=>{for(const listener of listeners)try{listener();}catch{/* One consumer cannot block another. */}});}catch{/* A later ordinary host event can reconnect. */}
  }
  return{
    reconnect,
    subscribe(listener){listeners.add(listener);reconnect();return()=>{listeners.delete(listener);if(!listeners.size){unsubscribe?.();unsubscribe=undefined;connected=null;}};},
    read({scopeId,afterSeq}){
      const waiting='等待千千结保存本楼摘要与状态。';
      try{
        reconnect();
        if(!connected)return{status:'unavailable',throughSeq:null,message:'等待支持就绪通知的千千结公共接口。'};
        // BMX uses host messageIndex + 1, never QQJ's independent assistantSeq.
        const progress=record(connected.getReadiness({afterMessageIndex:afterSeq-1}));
        if(!progress)return{status:'error',throughSeq:null,message:'千千结就绪信息无法读取。'};
        if(progress.status!=='ready')return{status:progress.status==='error'?'error':progress.status==='disabled'?'unavailable':'waiting',throughSeq:null,message:waiting};
        if(record(progress.identity)?.qqjChatId!==scopeId)return{status:'waiting',throughSeq:null,message:'等待千千结对齐当前聊天。'};
        const index=progress.readyThroughMessageIndex;
        if(index!==null&&(!Number.isSafeInteger(index)||Number(index)<0))return{status:'error',throughSeq:null,message:'千千结就绪楼号无法读取。'};
        const throughSeq=index===null?null:Number(index)+1;
        return{status:'ready',throughSeq:throughSeq!==null&&throughSeq>afterSeq?throughSeq:null,message:waiting};
      }catch{return{status:'error',throughSeq:null,message:'读取千千结就绪信息失败。'};}
    },
  };
}
