import {createMemoryHost,MemoryNode,settle} from './testing/production-vue.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {defineComponent,h,reactive} from 'vue';
const {default:Plasma}=await import('./PlasmaLandscape.vue');
const {default:Taste}=await import('./TastePage.vue');
test('actual Vue canvas redraws on in-place numeric changes and isolates unavailable canvas without losing content',async()=>{
 const host=createMemoryHost(),frames=[];let fail=false;
 const oldContext=MemoryNode.prototype.getContext;
 MemoryNode.prototype.getContext=function(){if(fail)throw Error('canvas unavailable');const node=this;return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(image){node.pixels=image.data;},drawImage(source){frames.push(source.pixels);}};};
 try{const values=reactive({dissatisfaction:80});const Wrapper=defineComponent({setup:()=>()=>h('article',[h(Plasma,{circleId:'c',emotionValues:values}),h('p','已保存的公开说明')])});const {container}=await host.mount(Wrapper);assert.equal(frames.length,1);values.dissatisfaction=15;await settle();assert.equal(frames.length,2);assert.notDeepEqual(frames[0],frames[1]);fail=true;values.dissatisfaction=20;await settle();assert.match(container.textContent,/已保存的公开说明/);}
 finally{host.cleanup();if(oldContext)MemoryNode.prototype.getContext=oldContext;else delete MemoryNode.prototype.getContext;}
});
test('landscape crop preserves circular proportions instead of squeezing a square texture into stripes',async()=>{
 const host=createMemoryHost(),calls=[],oldContext=MemoryNode.prototype.getContext;
 MemoryNode.prototype.getContext=function(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(){},drawImage(...args){calls.push(args);}};};
 try{await host.mount(Plasma,{circleId:'geometry',emotionValues:{affinity:70}});const [source,sx,sy,sw,sh,dx,dy,dw,dh]=calls[0];assert.ok(Math.abs(dw/sw-dh/sh)<.01);assert.equal(source.width,384);assert.ok(sy+sh<=source.height);}
 finally{host.cleanup();if(oldContext)MemoryNode.prototype.getContext=oldContext;else delete MemoryNode.prototype.getContext;}
});
test('taste keeps the whole circle name on its heading over a decorative canvas while prose still expands on its own',async()=>{
 const host=createMemoryHost();
 const oldObserver=globalThis.ResizeObserver;
 const oldContext=MemoryNode.prototype.getContext;
 globalThis.ResizeObserver=class{observe(){} disconnect(){}};
 globalThis.getComputedStyle=()=>({lineHeight:'24px'});
 let frames=0;
 MemoryNode.prototype.getContext=function(){
  if(this.width===720)throw Error('landscape cannot draw');
  frames++;
  return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
 };
 try{
  host.viewport.innerWidth=320;
  const title='西桥街坊熟人圈'+('SuperLongUnbrokenName').repeat(4);
  const text='这段公开近况仍由原来的正文控件负责展开。';
  const {container}=await host.mount(Taste,{
   state:{world:{people:[]},source:{status:'ready'}},
   circles:[{id:'mixed',title,description:text,personIds:[],emotionValues:{fear:100}}],
  });
  const article=container.querySelector('article'),heading=article.querySelector('.bmx-record-title');
  const backdrop=heading.querySelector('canvas'),overview=article.querySelector('button.bmx-mood-toggle');
  assert.equal(frames,1);
  assert.equal(heading.tagName,'H3');
  assert.equal(heading.textContent,title);
  assert.ok(backdrop,'the circle canvas is inside its heading');
  assert.equal(backdrop.getAttribute('aria-hidden'),'true');
  assert.equal(heading.contains(overview),false);
  assert.equal(overview.getAttribute('aria-expanded'),false);
  overview.fire('click');
  await settle();
  assert.equal(overview.getAttribute('aria-expanded'),true);
  assert.equal(overview.querySelector('.bmx-mood-overview').textContent,text);
 }
 finally{
  host.cleanup();
  if(oldObserver)globalThis.ResizeObserver=oldObserver;else delete globalThis.ResizeObserver;
  if(oldContext)MemoryNode.prototype.getContext=oldContext;else delete MemoryNode.prototype.getContext;
 }
});
