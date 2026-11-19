import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMemoryHost,MemoryNode,settle} from './testing/production-vue.mjs';
import {h,ref} from 'vue';

const {default:HearingPage}=await import('./HearingPage.vue');
const originalGetContext=MemoryNode.prototype.getContext;
test.before(()=>{
 const draw=()=>{};
 MemoryNode.prototype.getContext=()=>({arc:draw,beginPath:draw,bezierCurveTo:draw,clip:draw,ellipse:draw,fill:draw,
  fillRect:draw,lineTo:draw,moveTo:draw,quadraticCurveTo:draw,restore:draw,rotate:draw,save:draw,stroke:draw,translate:draw});
});
test.after(()=>{
 if(originalGetContext)MemoryNode.prototype.getContext=originalGetContext;
 else delete MemoryNode.prototype.getContext;
});

const currentText='门口腾出位置后，众人把搬来的纸箱分批放好。'.repeat(8)+'\n\n后续安排等到雨停再定。';
const people=['甲','欧阳清和连着两个长名字','丙','丁'].map((name,index)=>({id:'p'+index,name}));
const activity=(id,count,status='active')=>({id,description:'已存概况',status,participantIds:people.slice(0,count).map(p=>p.id),sources:[]});
const progress=(id,activityId,description)=>({id,activityId,description,storyTime:null,participantIds:[],sources:[{kind:'simulation',id:'saved',label:''}]});
const state={
 source:{status:'ready',message:''},busy:false,error:'',
 world:{id:'fictional',people,activities:[activity('one',1,'planned'),activity('two',2,'waiting'),activity('three',3),activity('four',4,'completed')],
  events:[progress('p-old','three','最早一段'),progress('p-middle','three','近日进展'),progress('p-now','three',currentText),progress('other','one','同目录的另一事务')],knowledge:[]},
};
const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
async function mount({anchorTop=240,anotherRoster=false,viewportWidth=320,openEchoes=true}={}){
 const host=createMemoryHost(),stage=new MemoryNode(),scroll=new MemoryNode();
 host.viewport.innerWidth=viewportWidth;
 stage.className='bmx-content-stage';
 scroll.className='bmx-shell-content';
 stage.getBoundingClientRect=()=>rect(10,80,viewportWidth-20,400);
 scroll.getBoundingClientRect=()=>rect(10,80,viewportWidth-20,stage.querySelector('.is-docked')?216:400);
 scroll.scrollTop=0;
 host.root.appendChild(stage);stage.appendChild(scroll);
 const active=ref(true),chosen=[];
 const fixtureState=anotherRoster?{...state,world:{...state.world,activities:[...state.world.activities,activity('another',4)]}}:state;
 const {container}=await host.mount({render:()=>h(HearingPage,{state:fixtureState,stage,active:active.value,onPerson:id=>chosen.push(id)})});
 scroll.appendChild(container);
 const row=id=>container.querySelector('[data-result-id="'+id+'"]');
 const echoes=container.querySelector('.bmx-hearing-echoes-toggle');
 if(openEchoes){echoes.fire('click');await settle();}
 const group=row('four')?.querySelector('.bmx-hearing-member-group');
 if(group)group.getBoundingClientRect=()=>rect(210,anchorTop-scroll.scrollTop,82,44);
 return {host,stage,scroll,container,active,chosen,row,group,echoes};
}

test('ended lines are lazy and collapse into the 余音 disclosure without hiding current work',async()=>{
 const f=await mount({openEchoes:false});
 try{
  assert.equal(f.echoes.textContent,'余音');
  assert.equal(f.echoes.props['aria-expanded'],false);
  assert.ok(f.row('three'));
  assert.equal(f.row('four'),null);
  f.echoes.fire('click');await settle();
  assert.equal(f.echoes.props['aria-expanded'],true);
  assert.equal(f.row('four').parent?.props.id,'bmx-hearing-echoes');
  f.echoes.fire('click');await settle();
  assert.equal(f.row('four'),null);
  assert.ok(f.row('two'));
 }finally{f.host.cleanup();}
});

test('the production hearing page renders the full multi-paragraph current text and only toggles real earlier progress',async()=>{
 const f=await mount();
 try{
  const one=f.row('one'),three=f.row('three');
  assert.ok(one.querySelector('p.bmx-hearing-body'));
  assert.equal(one.querySelector('.bmx-hearing-progress-toggle'),null);
  assert.equal(f.row('two').querySelector('.bmx-hearing-progress-toggle'),null);
  const toggle=three.querySelector('button.bmx-hearing-progress-toggle');
  assert.ok(toggle,'current prose should be a disclosure when there is earlier progress');
  assert.equal(three.querySelector('.bmx-hearing-body').textContent,currentText);
  assert.equal(toggle.props['aria-expanded'],false);
  assert.doesNotMatch(three.textContent,/最早一段|近日进展/);
  toggle.fire('click');await settle();
  assert.equal(toggle.props['aria-expanded'],true);
  const earlier=three.querySelectorAll('.bmx-hearing-previous');
  assert.deepEqual(earlier.map(node=>node.textContent),['近日进展。','最早一段。']);
  assert.equal(earlier[0].closest('.bmx-hearing-timeline'),toggle.closest('.bmx-hearing-timeline'));
  toggle.fire('click');await settle();
  assert.equal(toggle.props['aria-expanded'],false);
  assert.equal(three.querySelectorAll('.bmx-hearing-previous').length,0);
  assert.equal(three.querySelector('.bmx-hearing-body').textContent,currentText);
  assert.equal(f.row('two').querySelector('.bmx-task-status').textContent,'等待中');
  assert.doesNotMatch(f.container.textContent,/近况|历史|更多事务操作/);
 }finally{f.host.cleanup();}
});

test('hearing keeps four textual phases and applies the past tone only to earlier and completed steps',async()=>{
 const rows=[['one','planned','计划中'],['two','waiting','等待中'],['three','active','推进中'],['four','completed','已完成']];
 for(const viewportWidth of [320,390]){
  const f=await mount({viewportWidth});
  try{
   for(const [id,status,label] of rows){
    const row=f.row(id);
    const pill=row.querySelector('.bmx-task-status');
    assert.equal(pill.textContent,label);
    assert.equal(pill.props.title,status==='completed'?'整条事项已完成':undefined);
    assert.equal(pill.props['data-status'],status);
    assert.equal(row.props['data-status'],status);
   }
   const toggle=f.row('three').querySelector('.bmx-hearing-progress-toggle');
   toggle.fire('click');await settle();
   assert.equal(f.row('three').querySelectorAll('.bmx-hearing-previous').length,2);
   assert.equal(toggle.props['aria-expanded'],true);
  }finally{f.host.cleanup();}
 }
 const css=readFileSync(new URL('./record-pages.css',import.meta.url),'utf8');
 assert.match(css,/\.bmx-hearing-footer \.bmx-task-status\s*\{[^}]*border-radius:\s*999px/);
 assert.match(css,/\.bmx-hearing-task\[data-status=completed\] > \.bmx-hearing-timeline > \.bmx-hearing-step\s*\{[^}]*--bmx-hearing-step-ink:\s*var\(--bmx-hearing-past/);
 assert.match(css,/\.bmx-hearing-step::after\s*\{[^}]*background:\s*var\(--bmx-hearing-step-ink\)/);
 assert.match(css,/\.bmx-hearing-previous\s*\{[^}]*color:\s*var\(--bmx-hearing-step-ink\)/);
 assert.match(css,/\.bmx-hearing-body\s*\{[^}]*color:\s*var\(--bmx-hearing-step-ink/);
});

test('one to three avatars navigate directly and four open a compact, dismissible roster in the same stage',async()=>{
 const f=await mount();
 try{
  for(const [id,count] of [['one',1],['two',2],['three',3]]){
   const buttons=f.row(id).querySelectorAll('button.bmx-hearing-member');
   assert.equal(buttons.length,count);
   assert.equal(buttons[0].querySelector('canvas').props.style.width,'18px');
   assert.equal(f.row(id).querySelector('.bmx-hearing-member-group'),null);
   buttons.at(-1).fire('click');
  }
  assert.deepEqual(f.chosen,['p0','p1','p2']);
  assert.ok(f.row('two').querySelector('.bmx-hearing-member-name.is-long'));
  assert.ok(f.group);
  assert.equal(f.group.querySelectorAll('.bmx-hearing-stacked-avatar').length,3);
  assert.equal(f.group.querySelector('canvas').props.style.width,'18px');
  f.group.fire('click',{pointerId:17,pointerType:'touch',detail:1});await settle();
  let popup=f.stage.querySelector('.bmx-hearing-participants-popup');
  assert.ok(popup);
  assert.equal(popup.parent,f.stage);
  assert.equal(f.scroll.querySelector('.bmx-hearing-participants-popup'),null);
  assert.equal(popup.querySelectorAll('.bmx-hearing-person-option').length,4);
  assert.equal(popup.querySelector('canvas').props.style.width,'24px');
  popup.querySelector('.bmx-hearing-close-people').fire('click');await settle();
  assert.equal(f.stage.querySelector('.bmx-hearing-participants-popup'),null);
  assert.equal(f.host.root.activeElement,f.group);
  f.group.fire('click');await settle();
  popup=f.stage.querySelector('.bmx-hearing-participants-popup');
  assert.equal(popup.fire('keydown',{key:'Escape'}).defaultPrevented,true);await settle();
  assert.equal(f.stage.querySelector('.bmx-hearing-participants-popup'),null);
  f.group.fire('click');await settle();
  popup=f.stage.querySelector('.bmx-hearing-participants-popup');
  popup.querySelectorAll('.bmx-hearing-person-option').at(-1).fire('click');await settle();
  assert.deepEqual(f.chosen,['p0','p1','p2','p3']);
  f.group.fire('click');await settle();f.active.value=false;await settle();
  assert.equal(f.stage.querySelector('.bmx-hearing-participants-popup'),null);
 }finally{f.host.cleanup();}
});

test('the hearing footer fits a single compact row and preserves long names for assistive technology',async()=>{
 const f=await mount();
 try{
  const footer=f.row('three').querySelector('.bmx-hearing-footer');
  assert.equal(footer.querySelector('.bmx-task-status').textContent,'推进中');
  const member=footer.querySelector('.is-long').closest('button');
  assert.equal(member.props.title,people[1].name);
  assert.equal(member.querySelector('.is-long').textContent,people[1].name);
  assert.equal(member.querySelector('canvas').props.style.width,'18px');
  const css=readFileSync(new URL('./record-pages.css',import.meta.url),'utf8');
  const rule=selector=>css.slice(css.indexOf(selector+' {')+selector.length+2).split('}',1)[0];
  assert.match(rule('.bmx-hearing-task'),/padding:\s*7px 0/);
  assert.match(rule('.bmx-hearing-footer'),/margin-top:\s*3px/);
  assert.doesNotMatch(rule('.bmx-hearing-footer'),/flex-wrap:\s*wrap/);
  assert.match(rule('.bmx-hearing-members'),/min-width:\s*0/);
  assert.match(rule('.bmx-window .bmx-hearing-member'),/flex-direction:\s*row/);
  assert.match(rule('.bmx-window :is(.bmx-hearing-member,.bmx-hearing-member-group)'),/min-height:\s*24px/);
  assert.match(rule('.bmx-hearing-member-name'),/max-width:\s*3em/);
  assert.match(rule('.bmx-hearing-member-name'),/text-overflow:\s*ellipsis/);
  assert.match(rule('.bmx-window .bmx-hearing-member-group'),/min-height:\s*32px/);
 }finally{f.host.cleanup();}
});

test('a roster at the bottom keeps the last item reachable and releases listeners after closing',async()=>{
 const f=await mount({anchorTop:409});
 try{
  assert.ok(f.group);
  f.group.fire('click');await settle();
  const popup=f.stage.querySelector('.bmx-hearing-participants-popup');
  assert.ok(popup?.matches('.is-docked'));
  assert.ok(f.group.getBoundingClientRect().bottom<f.scroll.getBoundingClientRect().bottom,'trigger remains inside the scroll viewport');
  assert.equal(f.scroll.listeners.get('scroll')?.size,1);
  f.scroll.scrollTop+=12;f.scroll.dispatch('scroll',{});await settle();
  assert.equal(f.stage.querySelector('.bmx-hearing-participants-popup'),null);
  assert.equal(f.scroll.listeners.get('scroll')?.size,0);
 }finally{f.host.cleanup();}
});

test('one tap on another avatar stack switches the open roster',async()=>{
 const f=await mount({anotherRoster:true});
 try{
  const next=f.row('another').querySelector('button.bmx-hearing-member-group');
  next.getBoundingClientRect=()=>rect(210,310,82,44);
  f.group.fire('click');await settle();
  assert.equal(f.group.props['aria-expanded'],true);
  next.fire('click',{pointerId:18,pointerType:'touch',detail:1});await settle();
  assert.equal(f.group.props['aria-expanded'],false);
  assert.equal(next.props['aria-expanded'],true);
  assert.equal(f.stage.querySelectorAll('.bmx-hearing-participants-popup').length,1);
 }finally{f.host.cleanup();}
});
