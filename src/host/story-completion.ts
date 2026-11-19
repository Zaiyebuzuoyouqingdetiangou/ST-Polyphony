import {getHostContext} from './host-context';
import type {StoryReadinessReader} from '../application/contracts';

export function subscribeStoryCompletion(callback:(messageId?:unknown,generationType?:unknown,source?:string)=>void,getContext=getHostContext,readiness?:StoryReadinessReader):(()=>void)&{registered:boolean;event?:string} {
  const context=getContext();
  const events=context?.eventSource as {on?(name:string,callback:()=>void):void;removeListener?(name:string,callback:()=>void):void;off?(name:string,callback:()=>void):void}|undefined;
  const types=(context?.eventTypes??context?.event_types) as Record<string,string>|undefined;
  const bindings:Array<[string,(...args:unknown[])=>void]>=[];
  function listen(key:string,source:string,generation=false){
    const event=types?.[key];if(!event||!events?.on)return;
    const listener=(...args:unknown[])=>{if(generation&&args[2]===true)return;readiness?.reconnect();callback(generation?undefined:args[0],generation?args[0]:args[1],source);};
    events.on(event,listener);bindings.push([event,listener]);
  }
  const offReadiness=readiness?.subscribe(()=>callback(undefined,undefined,'qqj-ready'));
  listen('USER_MESSAGE_RENDERED','user-message');
  listen('GENERATION_STARTED','generation-started',true);
  listen('CHARACTER_MESSAGE_RENDERED','rendered');
  return Object.assign(()=>{offReadiness?.();for(const [event,listener] of bindings){if(events?.removeListener)events.removeListener(event,listener);else events?.off?.(event,listener);}},{registered:bindings.length>0||Boolean(offReadiness),event:bindings.map(([name])=>name).join(',')||undefined});
}
