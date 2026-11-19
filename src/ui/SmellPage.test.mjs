import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createMemoryHost,MemoryNode,settle} from './testing/production-vue.mjs';
import {h,shallowRef} from 'vue';
const {default:SmellPage}=await import('./SmellPage.vue');

function record(medium,window,index,throughSeq,count=1){
  return {medium,recordId:'media-'+window+'-'+index,throughSeq,count};
}
const refs=[
  record('纸媒','archived',0,8,2),
  record('电子刊','past',0,9),record('公开频道','past',1,9),
  record('纸媒','previous',0,10,4),record('传闻','previous',1,10),
  record('广播','current',0,11,2),record('纸媒','current',1,11,4),
];
async function fixture(width=390,reduced=true,rows=refs,entryFor=(row,index)=>({
  source:'模拟来源',type:row.medium,title:row.medium+index,body:'已归档消息',sourceSeq:row.throughSeq,
})){
  const host=createMemoryHost(),panel=new MemoryNode('section');
  host.viewport.innerWidth=width;
  host.viewport.matchMedia=()=>({matches:reduced});
  panel.className='bmx-window';
  host.root.appendChild(panel);
  const base={id:'fixture',people:[{id:'p',name:'甲'}],events:[],activities:[],knowledge:[],publicMessageIndex:rows,lastHearingWindow:{id:'current'}};
  const state=shallowRef({world:base,source:{status:'ready',message:''},processedThroughSeq:11,busy:false,error:''});
  const calls=[],opened=[];
  const reader={async read(scope,rows){
    calls.push([scope,rows.map(row=>row.recordId)]);
    return rows.map(row=>({recordId:row.recordId,entries:Array.from({length:row.count},(_,index)=>entryFor(row,index))}));
  }};
  const {container}=await host.mount({setup:()=>()=>h(SmellPage,{state:state.value,active:true,panel,reader,onOpen:value=>opened.push(value)})});
  const deck=()=>container.querySelector('.bmx-smell-arc');
  const button=name=>container.querySelectorAll('.bmx-smell-folder').find(node=>node.textContent.trim().startsWith(name));
  const active=()=>container.querySelector('.bmx-smell-folder[aria-current=true]');
  const hint=name=>container.querySelectorAll('.bmx-smell-update').find(node=>!name||node.props.title===name+'有新消息');
  const dialog=()=>panel.querySelector('.bmx-smell-folder-view');
  return {host,panel,container,state,base,calls,opened,deck,button,active,hint,dialog};
}

test('the overview changes focus with keyboard, wheel and swipe without loading a folder',async()=>{
  for(const width of [320,390]){
    const f=await fixture(width);
    try{
      const focused=f.button('纸媒'),adjacent=f.button('广播');
      assert.equal(f.active()?.props['data-medium'],'纸媒');
      assert.equal(focused.props.tabindex,0);
      assert.equal(adjacent.props.tabindex,-1);
      assert.equal(f.deck().props['aria-label'],'公开消息载体');
      assert.ok(f.hint('广播'));
      assert.ok(f.hint('纸媒'));
      const key=focused.fire('keydown',{key:'ArrowDown'});
      await settle();
      assert.equal(key.defaultPrevented,true);
      assert.equal(f.active(),adjacent);
      assert.equal(f.host.documentRef.activeElement,adjacent);
      assert.ok(f.hint('广播'));
      assert.ok(f.hint('纸媒'));
      const wheel=f.deck().fire('wheel',{deltaY:52,deltaMode:0,timeStamp:20});
      await settle();
      assert.equal(wheel.defaultPrevented,true);
      assert.equal(f.active(),f.button('公告'));
      const origin=f.active();
      origin.fire('pointerdown',{clientX:100,clientY:240,pointerType:'touch'});
      origin.fire('pointermove',{clientX:100,clientY:270,pointerType:'touch'});
      // Touch implicitly captured the button before capture transferred to the overview.
      origin.fire('lostpointercapture',{pointerType:'touch'});
      origin.fire('pointermove',{clientX:100,clientY:320,pointerType:'touch'});
      origin.fire('pointerup',{clientX:100,clientY:320,pointerType:'touch'});
      origin.fire('click',{detail:1});
      await settle();
      assert.equal(f.active(),adjacent);
      assert.equal(f.dialog(),null);
      assert.deepEqual(f.calls,[]);
    }finally{f.host.cleanup();}
  }
});

test('the folder reads three stable layouts for each medium from the same message fields',async()=>{
  const categories=[
    ['纸媒','街报','newspaper'],['纸媒','便签','note'],['纸媒','海报告示','notice'],['纸媒','公开信','letter'],
    ['传闻','街谈','rumor'],['广播','街口广播','radio'],['实录','录音转写','record'],['公开频道','频道帖','channel'],
    ['专题','地方纪事','feature'],['副刊','怪谈文学','supplement'],
    ['其他','陌生载体','plain'],
  ];
  for(const [medium,type,kind] of categories){
    const rows=[0,1,2].map(i=>record(medium,'example',i,7+i,1));
    const f=await fixture(320,true,rows,row=>({source:'原出处',type,title:'一份旧消息',body:'第一段的原话。\n第二段含有 <b> 文字。',sourceSeq:row.throughSeq}));
    try{
      assert.deepEqual(f.calls,[]);
      f.button(medium).fire('click');
      await settle();
      const cards=f.dialog().querySelectorAll('.bmx-smell-sheet');
      assert.equal(cards.length,3);
      assert.deepEqual(cards.map(card=>card.props['data-media']),[kind,kind,kind]);
      assert.deepEqual(new Set(cards.map(card=>card.props['data-variant'])),new Set(['a','b','c']));
      for (const card of cards) {
        for(const content of ['原出处','一份旧消息','第一段的原话。','第二段含有 <b> 文字。','第 ']) assert.ok(card.textContent.includes(content));
        assert.equal(card.querySelector('b'),null);
      }
      f.dialog().querySelector('.bmx-smell-lip').fire('click');
      await settle();
      f.button(medium).fire('click');
      await settle();
      assert.deepEqual(f.dialog().querySelectorAll('.bmx-smell-sheet').map(card=>card.props['data-variant']),cards.map(card=>card.props['data-variant']));
      assert.equal(f.calls.length,1);
    }finally{f.host.cleanup();}
  }
});

test('folder tiles and unread shortcuts use the same reader, cache and close paths',async()=>{
  const f=await fixture();
  try{
    const paper=f.button('纸媒');
    paper.fire('click');
    await settle();
    assert.equal(f.dialog().parent,f.panel);
    assert.equal(f.dialog().querySelectorAll('.bmx-smell-sheet').length,8);
    f.dialog().querySelector('.bmx-smell-more').fire('click');
    await settle();
    assert.equal(f.dialog().querySelectorAll('.bmx-smell-sheet').length,10);
    f.dialog().querySelector('.bmx-smell-edge.is-right').fire('click');
    await settle();
    assert.equal(f.dialog(),null);
    assert.equal(f.host.documentRef.activeElement,paper);
    assert.equal(f.hint('纸媒'),undefined);
    const broadcast=f.button('广播');
    assert.equal(broadcast.props['aria-current'],undefined);
    const shortcut=f.hint('广播');
    assert.ok(shortcut);
    shortcut.fire('click');
    await settle();
    assert.equal(f.dialog().querySelector('strong').textContent,'广播');
    f.dialog().querySelector('.bmx-smell-lip').fire('keydown',{key:'Escape'});
    await settle();
    assert.equal(f.host.documentRef.activeElement,broadcast);
    assert.equal(f.active()?.props['data-medium'],'广播');
    assert.equal(f.hint('广播'),undefined);
    broadcast.fire('click');
    await settle();
    assert.equal(f.dialog().querySelector('strong').textContent,'广播');
    f.dialog().querySelector('.bmx-smell-lip').fire('click');
    await settle();
    assert.equal(f.host.documentRef.activeElement,broadcast);
    assert.deepEqual(f.calls,[['fixture',['media-current-1','media-previous-0']],['fixture',['media-archived-0']],['fixture',['media-current-0']]]);
    f.state.value={...f.state.value,world:{...f.base,lastHearingWindow:{id:'quiet-on-same-floor'}}};
    await settle();
    assert.equal(f.hint(),undefined);
    f.state.value={...f.state.value,processedThroughSeq:12,world:{...f.base,lastHearingWindow:undefined}};
    await settle();
    assert.equal(f.hint(),undefined);
    f.state.value={...f.state.value,processedThroughSeq:11,world:{...f.base,lastHearingWindow:undefined}};
    await settle();
    assert.equal(f.hint(),undefined);
  }finally{f.host.cleanup();}
});

test('the overview folds the same lid and moves the same paper along the reference path',async()=>{
  const f=await fixture(390,false);
  try{
    const callbacks=new Map();
    let frameId=0;
    f.host.viewport.requestAnimationFrame=callback=>{const id=++frameId;callbacks.set(id,callback);return id;};
    f.host.viewport.cancelAnimationFrame=id=>callbacks.delete(id);
    const frame=async now=>{
      assert.equal(callbacks.size,1);
      const [id,callback]=callbacks.entries().next().value;
      callbacks.delete(id);callback(now);
      await settle();
    };
    const paper=f.button('纸媒'),radio=f.button('广播'),sheet=radio.querySelector('.bmx-smell-peek');
    const lid=radio.querySelector('.bmx-smell-lid');
    assert.ok(lid,'the folder has a separate folding lid');
    const style=node=>node.props.style;
    const near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,String(a)+' ≠ '+String(b));
    near(style(paper)['--bmx-folder-scale'],1.1);
    near(parseFloat(style(paper).left),144/(374*.64)*100);
    near(parseFloat(style(paper).top),268/601*100);
    near(style(paper)['--bmx-folder-unfold'],1);
    near(style(radio)['--bmx-folder-scale'],.68);
    near(style(radio)['--bmx-folder-unfold'],0);
    paper.fire('keydown',{key:'ArrowRight'});
    await settle();await frame(0);await frame(240);
    const t=1-.5/.73,midScale=.81-.13*.5+.29*t*t*(3-2*t);
    near(style(radio)['--bmx-folder-scale'],midScale);
    near(style(paper)['--bmx-folder-scale'],midScale);
    near(style(radio)['--bmx-folder-unfold'],.5);
    near(style(paper)['--bmx-folder-unfold'],.5);
    assert.ok(parseFloat(style(paper).top)<parseFloat(style(radio).top));
    assert.ok(parseFloat(style(radio).left)<144/(374*.64)*100);
    assert.equal(radio.querySelector('.bmx-smell-peek'),sheet);
    assert.equal(radio.querySelector('.bmx-smell-lid'),lid);
    assert.equal(lid.parent,radio);
    await frame(480);
    near(style(radio)['--bmx-folder-scale'],1.1);
    near(style(radio)['--bmx-folder-unfold'],1);
    assert.equal(radio.querySelector('.bmx-smell-lid'),lid);
    assert.equal(callbacks.size,0);
    assert.deepEqual(f.calls,[]);
  }finally{f.host.cleanup();}
});

test('long labels keep the full accessible name while the deck and update text have bounded space',async()=>{
  const f=await fixture(320);
  try{
    const long='城镇公共公告与街坊日常交流栏';
    f.state.value={...f.state.value,world:{...f.base,publicMessageIndex:[
      record(long,'current',0,11),record('纸媒','current',1,11),
    ]}};
    await settle();
    assert.match(f.hint(long).textContent,/有新消息$/);
    assert.equal(f.hint(long).props.title,long+'有新消息');
    const key=f.active().fire('keydown',{key:'End'});
    await settle();
    assert.equal(key.defaultPrevented,true);
    assert.match(f.active().props['aria-label'],new RegExp(long));
    assert.equal(f.container.querySelector('.bmx-smell-readout').querySelector('strong').props.title,long);
    const wheel=f.deck().fire('wheel',{deltaY:40,deltaMode:0,timeStamp:1000});
    await settle();
    assert.equal(wheel.defaultPrevented,true);
    assert.equal(f.active()?.props['data-medium'],'传闻');
    const css=readFileSync(new URL('./smell-media.css',import.meta.url),'utf8');
    assert.match(css,/\.bmx-smell-readout strong\{[^}]*-webkit-line-clamp:2[^}]*overflow:hidden/);
    assert.match(css,/\.bmx-smell-update-label > :first-child\{[^}]*text-overflow:ellipsis/);
    assert.match(css,/\.bmx-smell-folder\[data-offstage\]\{visibility:hidden;pointer-events:none/);
  }finally{f.host.cleanup();}
});

test('six folders stay openable when empty and the arc wraps with neighbors on both sides',async()=>{
  const f=await fixture(320,true,[]);
  try{
    assert.equal(f.active()?.props['data-medium'],'纸媒');
    const folders=f.container.querySelectorAll('.bmx-smell-folder');
    assert.deepEqual(folders.map(node=>node.props['data-medium']),['传闻','纸媒','广播','公告','专题','副刊']);
    for(let index=0;index<folders.length;index++){
      const tile=f.active(),top=parseFloat(tile.props.style.top);
      const neighbors=folders.filter(node=>node!==tile&&node.props['data-offstage']===undefined);
      assert.equal(neighbors.filter(node=>parseFloat(node.props.style.top)<top).length,2);
      assert.equal(neighbors.filter(node=>parseFloat(node.props.style.top)>top).length,2);
      assert.ok(tile.querySelector('.bmx-smell-lid'));
      assert.equal(tile.querySelector('.bmx-smell-peek'),null);
      assert.match(tile.props['aria-label'],/0 条/);
      tile.fire('click');
      await settle();
      assert.match(f.dialog().textContent,/这个文件夹还没有消息/);
      f.dialog().querySelector('.bmx-smell-lip').fire('click');
      await settle();
      tile.fire('keydown',{key:'ArrowDown'});
      await settle();
    }
    assert.equal(f.active()?.props['data-medium'],'纸媒');
    assert.equal(f.calls.length,0);
  }finally{f.host.cleanup();}
});

test('shows all three unread folders, clears only the opened one, and marks a later batch unread again',async()=>{
  const media=['纸媒','传闻','广播'];
  const batch=media.map((medium,index)=>({...record(medium,'native',index,11),batchKey:'native',publishedAt:200}));
  const f=await fixture(320,true,batch);
  try{
    const notices=()=>f.container.querySelectorAll('.bmx-smell-update');
    const names=()=>notices().map(node=>node.props.title).sort();
    assert.deepEqual(names(),media.map(name=>name+'有新消息').sort());
    const paper=notices().find(notice=>notice.props.title==='纸媒有新消息');
    paper.fire('click');
    await settle();
    assert.match(f.dialog().textContent,/已归档消息/);
    f.dialog().querySelector('.bmx-smell-lip').fire('click');
    await settle();
    assert.deepEqual(names(),['传闻有新消息','广播有新消息']);
    assert.equal(f.host.documentRef.activeElement,f.button('纸媒'));
    f.state.value={...f.state.value,world:{...f.base,publicMessageIndex:[...batch,{...record('纸媒','later',0,11),batchKey:'later',publishedAt:201}]}};
    await settle();
    assert.deepEqual(names(),media.map(name=>name+'有新消息').sort());
  }finally{f.host.cleanup();}
});

test('a touch drag beginning in the right blank area can change folders',async()=>{
  const f=await fixture(320);
  try{
    const canvas=f.container.querySelector('.bmx-smell-folders');
    canvas.fire('pointerdown',{clientX:280,clientY:310,pointerType:'touch'});
    canvas.fire('pointermove',{clientX:280,clientY:235,pointerType:'touch'});
    canvas.fire('pointerup',{clientX:280,clientY:235,pointerType:'touch'});
    await settle();
    assert.equal(f.active()?.props['data-medium'],'广播');
    assert.deepEqual(f.calls,[]);
  }finally{f.host.cleanup();}
});
