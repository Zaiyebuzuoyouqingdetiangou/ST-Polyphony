import test from 'node:test';
import assert from 'node:assert/strict';
import { mobilePanelRect, desktopPanelSize, desktopPanelPosition, createPanelGeometryController, PANEL_POSITION_KEY, PANEL_SIZE_KEY } from './panel-geometry.js';
import { Events, MemoryNode, event } from './testing/production-vue.mjs';

test('current QQJ defaults, mobile margins and safe areas stay within the viewport',()=>{
  assert.deepEqual(mobilePanelRect(390,844),{left:10,right:10,width:370,top:20,bottom:60,height:764});
  assert.deepEqual(mobilePanelRect(320,640,50,34),{left:10,right:10,width:300,top:50,bottom:40,height:550});
  assert.deepEqual(desktopPanelSize(1440,900),{width:360,height:600,minWidth:320,minHeight:300,maxWidth:1420,maxHeight:880});
  assert.deepEqual(desktopPanelPosition(1440,900,360,600),{left:1060,top:70});
  for(const width of [320,390,640,641,768,1440,2560])for(const height of [240,600,900])for(const saved of [null,{width:1,height:1},{width:99999,height:99999}]){
    const size=desktopPanelSize(width,height,saved);assert.ok(size.width<=width-20&&size.height<=height-20);
    const position=desktopPanelPosition(width,height,size.width,size.height,{left:99999,top:-99999});assert.ok(position.left>=10&&position.left+size.width<=width-10);assert.ok(position.top>=10&&position.top+size.height<=height-10);
  }
});
function fixture(width=1440,height=900){
  const viewport=new Events();Object.assign(viewport,{innerWidth:width,innerHeight:height,visualViewport:new Events()});
  const panel=new MemoryNode(),dragHandle=new MemoryNode(),resizeHandle=new MemoryNode(),host=new MemoryNode();
  panel.classList={add(){},remove(){}};
  const root={host,activeElement:null};panel.getRootNode=()=>root;
  panel.getBoundingClientRect=()=>({left:parseFloat(panel.style.left)||0,top:parseFloat(panel.style.top)||0,width:parseFloat(panel.style.width)||360,height:parseFloat(panel.style.height)||600});
  host.getBoundingClientRect=()=>({left:24,top:-120});
  const data=new Map(),writes=[];const storage={getItem:key=>data.get(key)??null,setItem(key,value){writes.push(key);data.set(key,value);}};
  const controller=createPanelGeometryController({panel,dragHandle,resizeHandle,viewport,storage});
  const send=(surface,type,x,y,extra={})=>surface.dispatch(type,event(surface,{clientX:x,clientY:y,...extra}));
  return{viewport,panel,host,root,dragHandle,resizeHandle,data,writes,controller,send};
}
test('production drag/resize excludes buttons and mobile, persists completed gestures only and releases listeners',()=>{
  const f=fixture();assert.equal(f.panel.style.height,'600px');assert.equal(f.panel.style.top,'70px');assert.equal(f.host.style.transform,'translate(-24px, 120px)');
  const button=new MemoryNode('button');f.dragHandle.appendChild(button);f.send(f.dragHandle,'pointerdown',100,100,{target:button});f.send(f.dragHandle,'pointermove',150,150);f.send(f.dragHandle,'pointerup',150,150);assert.equal(f.writes.length,0);
  f.send(f.dragHandle,'pointerdown',100,100);f.send(f.dragHandle,'pointermove',50,130);f.send(f.dragHandle,'pointerup',50,130);assert.deepEqual(JSON.parse(f.data.get(PANEL_POSITION_KEY)),{left:1010,top:100});
  f.send(f.resizeHandle,'pointerdown',1370,700);f.send(f.resizeHandle,'pointermove',1200,500);f.send(f.resizeHandle,'pointerup',1200,500);assert.deepEqual(JSON.parse(f.data.get(PANEL_SIZE_KEY)),{width:320,height:400});
  const before=new Map(f.data);f.send(f.dragHandle,'pointerdown',50,50);f.send(f.dragHandle,'pointermove',100,100);f.send(f.dragHandle,'pointercancel',100,100);assert.deepEqual(f.data,before);
  f.viewport.innerWidth=390;f.viewport.dispatch('resize',{});f.send(f.resizeHandle,'pointerdown',0,0);f.send(f.resizeHandle,'pointermove',300,300);f.send(f.resizeHandle,'pointerup',300,300);assert.deepEqual(f.data,before);assert.equal(f.panel.style.width,'');
  f.viewport.innerWidth=1440;f.viewport.dispatch('resize',{});assert.equal(f.panel.style.width,'320px');assert.equal(f.panel.style.left,'1010px');
  f.controller.destroy();assert.ok([...f.viewport.listeners.values(),...f.viewport.visualViewport.listeners.values(),...f.dragHandle.listeners.values(),...f.resizeHandle.listeners.values()].every(set=>set.size===0));
});
test('visual viewport offsets clamp desktop geometry; mobile editable focus pauses only passive reflow',()=>{
  const f=fixture(768,900);Object.assign(f.viewport.visualViewport,{width:700,height:240,offsetLeft:30,offsetTop:120});f.viewport.visualViewport.dispatch('resize',{});
  assert.equal(f.panel.style.height,'220px');assert.equal(f.panel.style.top,'130px');assert.equal(f.panel.style['--bmx-panel-bounds-top'],'120px');
  f.viewport.innerWidth=390;f.controller.restore();const input=new MemoryNode('input');input.type='text';f.panel.appendChild(input);f.root.activeElement=input;
  f.viewport.visualViewport.height=180;f.viewport.visualViewport.dispatch('resize',{type:'resize'});assert.equal(f.panel.style['--bmx-panel-bounds-height'],'240px');
  f.viewport.dispatch('orientationchange',{type:'orientationchange'});assert.equal(f.panel.style['--bmx-panel-bounds-height'],'180px');
  input.readOnly=true;f.viewport.visualViewport.height=160;f.viewport.visualViewport.dispatch('scroll',{type:'scroll'});assert.equal(f.panel.style['--bmx-panel-bounds-height'],'160px');
  f.root.activeElement=null;f.viewport.visualViewport.height=600;f.viewport.visualViewport.dispatch('resize',{type:'resize'});assert.equal(f.panel.style['--bmx-panel-bounds-height'],'600px');f.controller.destroy();
});
