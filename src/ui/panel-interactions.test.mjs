import test from 'node:test';
import assert from 'node:assert/strict';
import {bindPanelInteractions} from './panel-interactions.js';
import {bindDialogViewport,createDialogBackdropHandlers} from './dialog-layout.js';
import {Events,MemoryNode,event} from './testing/production-vue.mjs';
function fixture(width=390){
 const documentRef=new Events(),viewport=new Events();Object.assign(viewport,{innerWidth:width,getComputedStyle:()=>({position:'fixed'})});documentRef.defaultView=viewport;
 const panel=new MemoryNode();const host=new MemoryNode();panel.getRootNode=()=>({host});panel.getBoundingClientRect=()=>({left:10,top:20,width:370,height:764});
 let open=true,dialog=false;const closes=[],escapes=[];const binding=bindPanelInteractions({panel,documentRef,isOpen:()=>open,hasDialog:()=>dialog,close:restore=>{closes.push(restore);open=false;},escape:()=>escapes.push(true)});
 const send=(type,target=new MemoryNode(),extra={})=>{const e=event(target,{clientX:0,clientY:5,composedPath:()=>[target],...extra});documentRef.dispatch(type,e);return e;};
 const tap=(target,extra={})=>{send('pointerdown',target,extra);send('pointerup',target,extra);return send('click',target,extra);};
 return{panel,host,viewport,documentRef,closes,escapes,binding,send,tap,set open(v){open=v;},set dialog(v){dialog=v;}};
}
test('mobile complete outside tap closes without stealing input focus; desktop stays open',()=>{
 const f=fixture(),input=new MemoryNode('input');const click=f.tap(input);assert.deepEqual(f.closes,[false]);assert.equal(click.defaultPrevented,false);assert.equal(click.stopped,undefined);
 const desktop=fixture(641);desktop.tap(input);assert.equal(desktop.closes.length,0);f.binding.destroy();desktop.binding.destroy();
});
test('swipe, return-to-origin motion, crossing from panel and cancelled/non-primary gestures never close',()=>{
 for(const mode of ['move','cross','cancel','secondary','missing-up']){
  const f=fixture(),outside=new MemoryNode();f.send('pointerdown',mode==='cross'?f.panel:outside,{...(mode==='cross'?{composedPath:()=>[f.panel],clientX:50,clientY:50}:{}),...(mode==='secondary'?{isPrimary:false}:{})});
  if(mode==='move')f.send('pointermove',outside,{clientX:20});
  if(mode==='cancel')f.send('pointercancel',outside);
  if(mode!=='missing-up')f.send('pointerup',outside);
  f.send('click',outside);assert.equal(f.closes.length,0,mode);f.binding.destroy();
 }
});
test('retargeted outside click consumes the panel action; foreign windows and own dialogs remain independent',()=>{
 const f=fixture();f.send('pointerdown');f.send('pointerup');const click=f.send('click',f.panel,{composedPath:()=>[f.panel]});assert.deepEqual(f.closes,[false]);assert.equal(click.stopped,true);assert.equal(click.defaultPrevented,true);
 for(const foreign of [new MemoryNode('dialog'),Object.assign(new MemoryNode(),{props:{role:'menu'}}),{nodeType:11,host:new MemoryNode()}]){const x=fixture();x.tap(foreign);assert.equal(x.closes.length,0);x.binding.destroy();}
 const own=fixture();own.dialog=true;own.tap(new MemoryNode());assert.equal(own.closes.length,0);own.binding.destroy();f.binding.destroy();
});
test('Escape respects consumed keys, IME, foreign controls, dialogs and cleanup',()=>{
 const f=fixture();for(const extra of [{defaultPrevented:true},{isComposing:true}])f.send('keydown',f.panel,{key:'Escape',composedPath:()=>[f.panel],...extra});
 f.send('keydown',new MemoryNode('input'),{key:'Escape'});assert.equal(f.escapes.length,0);
 f.send('keydown',f.panel,{key:'Escape',composedPath:()=>[f.panel]});assert.equal(f.escapes.length,1);
 f.dialog=true;f.send('keydown',f.panel,{key:'Escape',composedPath:()=>[f.panel]});assert.equal(f.escapes.length,1);
 f.binding.destroy();assert.ok([...f.documentRef.listeners.values()].every(set=>set.size===0));
});
test('independent dialog viewport compensates the host origin and removes listeners; its backdrop requires a complete tap',()=>{
 const viewport=new Events();Object.assign(viewport,{innerWidth:390,innerHeight:844,visualViewport:Object.assign(new Events(),{width:370,height:350,offsetLeft:10,offsetTop:80})});
 const overlay=new MemoryNode();overlay.getBoundingClientRect=()=>({left:24,top:-100});const stop=bindDialogViewport(overlay,viewport);assert.equal(overlay.style.left,'-14px');assert.equal(overlay.style.top,'180px');assert.equal(overlay.style.height,'350px');
 viewport.visualViewport.height=400;viewport.visualViewport.dispatch('resize',{});assert.equal(overlay.style.height,'400px');stop();assert.ok([...viewport.listeners.values(),...viewport.visualViewport.listeners.values()].every(set=>set.size===0));
 let closes=0;const handlers=createDialogBackdropHandlers(()=>closes++),sheet=new MemoryNode();
 const send=(type,target=overlay,extra={})=>handlers[type](event(target,{currentTarget:overlay,...extra}));
 send('pointerdown',sheet);send('pointerup');send('click');assert.equal(closes,0);
 send('pointerdown');send('pointermove',overlay,{clientX:20});send('pointerup');send('click');assert.equal(closes,0);
 send('pointerdown');send('pointercancel');send('pointerup');send('click');assert.equal(closes,0);
 send('pointerdown');send('pointerup');send('click');assert.equal(closes,1);
});

test('native dialog keeps its draft during IME Escape in a jQuery wrapper and closes on ordinary Escape',async()=>{
 const {createGouhuaDialogCore}=await import('./qqj/gouhua-dialog-core.js');
 const cases=[
  {label:'wrapped composition Escape 27',wrapper:{key:'Escape',keyCode:27},raw:{isComposing:true,keyCode:27},closed:false},
  {label:'wrapped composition Escape 229',wrapper:{key:'Escape',keyCode:229},raw:{isComposing:true,keyCode:229},closed:false},
  {label:'original 229 without composition flag',wrapper:{key:'Escape'},raw:{keyCode:229},closed:false},
  {label:'direct 229 without composition flag',wrapper:{key:'Escape',keyCode:229},closed:false},
  {label:'direct composition Escape',wrapper:{key:'Escape',isComposing:true},closed:false},
  {label:'ordinary wrapped Escape',wrapper:{key:'Escape',keyCode:27},raw:{isComposing:false,keyCode:27},closed:true},
  {label:'already consumed Escape',wrapper:{key:'Escape',isDefaultPrevented:()=>true},closed:false},
 ];
 for(const item of cases){
  const handlers=new Map(),node={};let removed=0,prevented=0,stopped=0;
  const selection={on(){return this;},last(){return this;},trigger(){return this;}};
  const overlay={0:node,on(type,handler){handlers.set(type,handler);return this;},addClass(){},remove(){removed++;},find(){return selection;}};
  const core=createGouhuaDialogCore({$:()=>overlay,mount:{appendChild(){}},removeOverlay(){},schedule(){}});
  const pending=core.choose({choices:[{value:true,label:'确定'}]});
  handlers.get('keydown')({...item.wrapper,originalEvent:item.raw,preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(!core.hasActive(),item.closed,item.label);assert.equal(removed,item.closed?1:0,item.label);assert.equal(prevented,item.closed?1:0,item.label);assert.equal(stopped,item.closed?1:0,item.label);
  if(core.hasActive())core.cancelActive();await pending;
 }
});
