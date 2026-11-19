import '../../scripts/source-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const {createEmptyState}=await import('../domain/world-state.ts');
const {generateDevelopment,prepareDevelopment}=await import('./development.ts');
const {generateAtmosphere}=await import('./atmosphere.ts');
const {selectFlowFocus}=await import('./flow-focus.ts');
const {advanceEmotion}=await import('../domain/emotion.ts');
const {createPeopleWorld}=await import('../application/people-world.ts');
const {createModelRequester}=await import('../models/client.ts');
const {mergeHistoryBatch}=await import('../history/merge.ts');
const {hearingActivities}=await import('../ui/hearing-activities.ts');
const {createWorldRepository}=await import('../storage/world-repository.ts');

const id='qqj:["chat","lin"]', other='qqj:["chat","wu"]';
const people=[{id,displayName:'林青',aliases:['小林'],source:{kind:'plugin',id:'林青',label:'人物资料'},description:'开店',identityDescription:'开店'},
 {id:other,displayName:'吴明',aliases:[],source:{kind:'plugin',id:'吴明',label:'人物资料'},description:'经营小店',identityDescription:'经营小店'}];
const start={id:'b1',text:'2025-11-06T10:00',sourceSeqs:[1]};
const baseline={id:'base',from:start,to:start,throughSeq:1,kind:'current',purpose:'baseline'};
const old={id:'old',title:'结清旧欠款',status:'waiting',description:'还在等发票原件。',participantIds:[id],sources:[]};
const prose='第一段，林青查清水电账单。\n\n第二段，店里继续营业！';
function sample(text='小林把水电账单收好。') {
 return {people,initial:false,story:{throughSeq:3,turns:[{seq:3,isUser:false,text:text+'<!-- QQJ-end 2025-11-06T11:00:00 -->'}]},
  state:{...createEmptyState('q'),processedThroughSeq:1,storyTime:{text:start.text},simulationRanges:[baseline],activities:[old],
   foundation:{windowId:'base',throughSeq:1,people:[],relations:[],groups:[{id:'shops',name:'街坊商户',description:'平日互相照应',members:people.map(person=>({personId:person.id,fromWindowId:'base'})),establishedWindowId:'base',currentStateWindowId:'base',sources:[]}]}}};
}
function deps(answer,seen=[]) {
 return {materials:{async readForQuestions(requests){seen.push(requests);return requests.map(()=>({status:'empty',routerText:'',materials:[],coverage:{partial:false}}));}},
  model:{async request(request){return typeof answer==='function'?answer(request):answer;}}};
}
const stage={key:'s',sourceSeqs:[3],onstagePersonIds:[],offstagePersonIds:[]};
const asserts={stageKey:'s',assertedPersonIds:[id],assertsUser:false};

test('prose without titles survives generation, save and cold read, with the same activity and old history labels',async()=>{
 const input=sample();
 const result=await generateDevelopment({...input,dependencies:deps({stages:[stage],
  activities:[{key:'billing',description:prose,participantIds:[id],status:'active',...asserts}],
  events:[{key:'first',activityId:'billing',description:prose,participantIds:[id],...asserts}]})});
 const activity=result.state.activities.at(-1),event=result.state.events.at(-1);
 assert.equal(activity.description,prose);assert.equal(event.description,prose);
 assert.equal(Object.hasOwn(activity,'title'),false);assert.equal(Object.hasOwn(event,'title'),false);
 assert.equal(event.activityId,activity.id);
 let stored;
 const repository=createWorldRepository({async put(_c,_id,data){return stored=JSON.parse(JSON.stringify({data,revision:1}));},async get(){return stored;}});
 await repository.save('q',result.state,0);
 const {state}=await repository.load('q');
 assert.equal(state.events.at(-1).activityId,state.activities.at(-1).id);
 assert.equal(state.activities[0].title,old.title);
});

test('surplus model titles are never saved for new records and title-only results become prose',async()=>{
 const input=sample();
 const result=await generateDevelopment({...input,dependencies:deps({stages:[stage],
  activities:[{key:'billing',title:'多返的事标题',description:prose,participantIds:[id],status:'active',...asserts}],
  events:[{key:'first',activityId:'billing',title:'只有旧标题的进展',participantIds:[id],...asserts}],
  calibration:{facts:[{key:'truth',title:'多返的事实标题',description:'正文确定的情况。',participantIds:[id],sourceSeqs:[3]}]}
 })});
 const records=[result.state.activities.at(-1),...result.state.events];
 assert.deepEqual(records.map(row=>row.description),[prose,'只有旧标题的进展','正文确定的情况。']);
 assert.ok(records.every(row=>!Object.hasOwn(row,'title')));
 assert.equal(result.state.activities[0].title,old.title);
});

test('titleless waiting matter wakes by a concrete term and QQJ receives only one short query batch',async()=>{
 const input=sample('水电账单已经寄到。');
 input.state.activities=[{...old,title:undefined,description:'水电账单需要由事主核对。\n\n'+prose.repeat(150)}];
 const reads=[];
 const prep=await prepareDevelopment({...input,dependencies:deps({},reads)});
 assert.deepEqual(prep.focus.activityIds,['old']);
 assert.equal(reads.length,1);assert.equal(reads[0].length,1);
 assert.ok(reads[0][0].question.includes('水电账单'));
 assert.ok(reads[0][0].question.length<=100);
 assert.ok(reads[0][0].question.split(' ').length>1);
 assert.ok(!reads[0][0].question.includes('第一段，林青查清'));
 const quiet=sample('第一段照常，大家继续。');
 quiet.state.activities=input.state.activities;
 assert.deepEqual(selectFlowFocus(people,quiet.state,quiet.story.turns,null).activityIds,[]);
});

test('formal clock advances hearing without a model clock and clips an overrun without losing prose',async()=>{
 const input=sample();
 const end={...start,id:'b2',text:'2025-11-06T10:30'};
 const legacy={id:'past',kind:'elapsed',from:start,to:end,throughSeq:1};
 input.state.simulationRanges.push(legacy);
 input.state.storyTime={text:start.text+' → '+end.text,source:{kind:'simulation',id:legacy.id,label:start.text+' → '+end.text}};
 const result=await generateDevelopment({...input,dependencies:deps({stages:[stage],
  events:[
   {key:'next',description:prose,participantIds:[id],storyTime:'11:05',...asserts},
   {key:'not-yet',description:'下午才准备清点工具。',participantIds:[id],status:'planned',...asserts}
  ]})});
 assert.equal(result.window.from.text,end.text);
 assert.equal(result.state.storyTime.text,'2025-11-06T11:00:00');
 assert.equal(result.state.events.length,1);
 assert.equal(result.state.events.at(-1).description,prose);
 assert.doesNotMatch(result.state.events.at(-1).storyTime?.text??'',/11:05/);
});

test('older and reference-only story windows preserve the saved clock; an unknown calendar stays at its own precision',async()=>{
 const older=sample();
 older.state.storyTime={text:'2025-11-06T13:00:00'};
 older.state.simulationRanges=[];
 const quiet=deps({quietReason:'时间没有进一步变化。'});
 const later=await generateDevelopment({...older,dependencies:quiet});
 assert.deepEqual(later.state.storyTime,older.state.storyTime);
 older.initial=true;
 older.state.processedThroughSeq=5;
 older.story.turns[0].calibrationEligible=false;
 const referenced=await generateDevelopment({...older,dependencies:quiet});
 assert.deepEqual(referenced.state.storyTime,older.state.storyTime);
 assert.equal(referenced.state.processedThroughSeq,5);

 const otherCalendar=sample();
 otherCalendar.story.turns[0].text='槐月十二日午后，店里继续营业。';
 const unnamed=await generateDevelopment({...otherCalendar,dependencies:deps({quietReason:'店里照常营业。',storyTime:{text:'槐月十二日午后',sourceSeqs:[3]}})});
 assert.equal(unnamed.state.storyTime.text,'槐月十二日午后');
});

test('one sourced settlement resolves explicit new and old matter references and keeps bad or ambiguous links independent',async()=>{
 const input=sample('小林对照账单，旧欠款结清，预付款也到账。');
 input.state.activities.push({...old,id:'another'});
 const fact=(key,description,activityId)=>({key,description,activityId,participantIds:[id],sourceSeqs:[3]});
 const facts=[
  {...fact('paid','旧欠款结清。','old'),storyTime:'2025-11-06T12:00'},
  fact('new-paid','预付款到账。','advance'),
  fact('unknown','另有一笔收入。','unprovided'),
  fact('same-name','这笔支出另记。',old.title),
  fact('unclear','还有一笔账。','shared-key'),
  fact('multiple','独立的一笔收款。',['old','another']),
 ];
 const result=await generateDevelopment({...input,dependencies:deps({calibration:{facts,activityUpdates:[
  {id:'old',key:'shared-key',change:{status:'completed'},sourceSeqs:[3]},
  {id:'another',key:'shared-key',change:{status:'active'},sourceSeqs:[3]},
  {key:'advance',change:{description:'预付款已经到账。',status:'completed',participantIds:[id]},sourceSeqs:[3]},
 ]}})});
 const [paid,advance,...independent]=result.state.events;
 assert.equal(paid.activityId,'old');assert.equal(paid.storyTime,null);
 assert.equal(advance.activityId,result.state.activities.find(a=>a.description==='预付款已经到账。').id);
 assert.equal(independent.length,4);
 assert.ok(independent.every(event=>event.activityId===null));
 assert.equal(result.state.activities[0].status,'completed');
});

test('same-floor settlement and street welcome use only the fact activityId despite a surplus reverse list',async()=>{
 const input=sample('小林对过水电账单后付清欠款。吴明代表街坊欢迎小林今后一起搭把手。');
 let instructions;
 const street='吴明代表街坊欢迎小林今后一起搭把手。';
 const payment='小林对过水电账单后付清欠款。';
 const result=await generateDevelopment({...input,dependencies:deps(request=>{
  instructions=request.instructions;
  return {calibration:{facts:[
   {key:'paid',activityId:'old',description:payment,participantIds:[id],sourceSeqs:[3]},
   {key:'welcome',description:street,participantIds:[id,other],sourceSeqs:[3]},
  ],activityUpdates:[
   {id:'old',change:{description:payment,status:'completed'},sourceSeqs:[3],factKeys:['paid','welcome']},
  ]}};
 })});
 assert.deepEqual(result.state.events.map(event=>[event.description,event.activityId]),[[payment,'old'],[street,null]]);
 assert.equal(result.state.activities[0].description,payment);
 assert.equal(result.state.activities[0].status,'completed');
 assert.match(instructions,/只通过facts的activityId/);
 assert.match(instructions,/同人、同楼.*候选/);
 assert.match(instructions,/activityUpdates.*只写该事项的现况/);
 assert.doesNotMatch(instructions,/factKeys/);
});

test('the accepted same-floor settlement scope leaves a merged fact independent and preserves compatible siblings',async()=>{
 const input=sample('小林与吴明付清水电账单。陈玉、梁山和张华欢迎小林今后一起搭手。');
 const neighbors=['陈玉','梁山','张华'].map((name,index)=>({id:'neighbor-'+index,displayName:name,aliases:[],description:'街坊',source:{kind:'plugin',id:name,label:'资料'}}));
 input.people=[...people,...neighbors];
 const paid='小林与吴明对完水电明细，款已结清。';
 const mixed='小林与吴明对完水电明细，款已结清；陈玉、梁山和张华欢迎小林加入街坊互助。';
 let instructions;
 const result=await generateDevelopment({...input,dependencies:deps(request=>{
  instructions=request.instructions;
  return {calibration:{
   facts:[
    {key:'merged',description:mixed,activityId:'old',participantIds:[id,other,...neighbors.map(person=>person.id)],sourceSeqs:[3]},
    {key:'receipt',description:'吴明确认款项到账。',activityId:'old',participantIds:[other],sourceSeqs:[3]},
   ],
   activityUpdates:[{id:'old',change:{status:'completed',description:paid,participantIds:[id,other]},sourceSeqs:[3]}],
  }};
 })});
 assert.deepEqual(result.state.events.map(event=>[event.description,event.activityId]),[[mixed,null],['吴明确认款项到账。','old']]);
 assert.deepEqual(result.state.events[0].participantIds,[id,other,...neighbors.map(person=>person.id)]);
 assert.equal(result.state.activities[0].status,'completed');
 assert.equal(result.state.activities[0].description,paid);
 assert.deepEqual(result.state.activities[0].participantIds,[id,other]);
 assert.match(instructions,/甲交货，乙邀甲入队/);
 assert.match(instructions,/新增直接当事人.*change.participantIds/);
});

test('old links still work without an accepted participant declaration from the fact source',async()=>{
 const input=sample('小林和吴明交清款项。');
 input.story.throughSeq=4;
 input.story.turns.push({seq:4,isUser:false,text:'两人第二天继续营业。'});
 const fact={description:'小林与吴明已结清款项。',activityId:'old',participantIds:[id,other],sourceSeqs:[3]};
 const updates=[
  [],
  [{id:'old',change:{status:'completed'},sourceSeqs:[3]}],
  [{id:'old',change:{status:'completed',participantIds:[id]},sourceSeqs:[4]}],
  [{id:'old',change:{status:'completed',participantIds:[id,'unknown']},sourceSeqs:[3]}],
  [{id:'old',change:{status:'completed',participantIds:[id]},sourceSeqs:[9]}],
 ];
 for(const activityUpdates of updates){
  const result=await generateDevelopment({...input,dependencies:deps({calibration:{facts:[fact],activityUpdates}})});
  assert.equal(result.state.events.at(-1).activityId,'old');
 }
 const known={...input,state:{...input.state,activities:[{...old,participantIds:[id,other]}]}};
 const linked=await generateDevelopment({...known,dependencies:deps({calibration:{facts:[fact],activityUpdates:[
  {id:'old',change:{status:'completed',participantIds:[id]},sourceSeqs:[3]},
 ]}})});
 assert.equal(linked.state.events[0].activityId,'old');
});

test('conflicting creative keys leave a sourced fact independent while another valid fact can stay linked',async()=>{
 const input=sample('小林先付清旧欠款，另对了两笔明细。');
 const result=await generateDevelopment({...input,dependencies:deps({stages:[stage],activities:[
  {key:'duplicate',description:'拟确认第一笔款项。',status:'planned',participantIds:[id],...asserts},
  {key:'duplicate',description:'拟确认第二笔款项。',status:'planned',participantIds:[id],...asserts},
 ],calibration:{facts:[
  {description:'小林对了明细。',activityId:'duplicate',participantIds:[id],sourceSeqs:[3]},
  {description:'小林付清旧欠款。',activityId:'old',participantIds:[id],sourceSeqs:[3]},
 ]}})});
 assert.deepEqual(result.state.events.map(event=>event.activityId),[null,'old']);
 assert.equal(result.state.activities.length,3);
});

test('a public quote from the right scene reaches hearing through taste acknowledgement',async()=>{
 const quote='小林当面对两家店主说：“欠款已经结清。”';
 const input=sample(quote);
 const calls=[];
 let saved;
 const dependencies=deps(request=>{
  calls.push(request.task);
  if(request.task==='atmosphere'){
   assert.match(request.instructions,/observation/);
   const range={key:'wind',circleRef:'foundation:group:shops',personIds:[id,other]};
   const observation={sourceSeq:3,quote,participantIds:[id]};
   const change={description:'两家店听到公开结账消息，气氛松了一些。',stageKey:'s',sourceSeqs:[3],assertedPersonIds:[],assertsUser:false,observation,emotion:{values:{relaxation:36},visibility:'public',change:'minor'}};
   return {stages:[{...stage,onstagePersonIds:[id]}],atmosphereUpdates:[{...range,key:'private',change:{...change,description:'私下怨恨',visibility:'private'}},{...range,key:'wrong',change:{...change,observation:{...observation,quote:'不在正文'}}},{...range,change}]};
  }
  assert.equal(request.input.atmospheres[0].description,'两家店听到公开结账消息，气氛松了一些。');
  assert.equal(request.input.circleEmotions[0].values.relaxation,36);
  return {quietReason:'本轮没有额外行动。'};
 });
 const prepared=await prepareDevelopment({...input,dependencies});
 const taste=await generateAtmosphere({...input,prepared,dependencies});
 assert.equal(taste.state.developmentAtmospheres.length,1);
 const repo=createWorldRepository({async put(_c,_id,data){return saved=JSON.parse(JSON.stringify({data,revision:1}));}});
 const ack=await repo.save('q',taste.state,0);
 await generateDevelopment({...input,state:ack.state,prepared,dependencies});
 assert.deepEqual(calls,['atmosphere','development']);
});

test('a verbatim private thought cannot support observation, major strength or ongoing worry on an otherwise public floor',async()=>{
 const secret='趁谁都没看见时，刘建军心里暗暗嫌珍姨多嘴。';
 const visible='小林说：“门口这块位置比昨天顺当多了。”';
 const input=sample(visible+secret);
 const dependencies=deps(()=>{
  const scope={circleRef:'foundation:group:shops',personIds:[id,other]};
  const change={description:'门口位置腾开后，做事轻松一些。',stageKey:'s',sourceSeqs:[3],assertedPersonIds:[],assertsUser:false,
   observation:{sourceSeq:3,quote:visible,participantIds:[id]},
   emotion:{values:{dissatisfaction:100,worry:40},visibility:'public',change:'major',ongoing:true,
    majorEvidence:{sourceSeq:3,quote:secret},ongoingEvidence:{sourceSeq:3,quote:secret}}};
  return {stages:[{...stage,onstagePersonIds:[id]}],atmosphereUpdates:[
   {...scope,key:'inner',change:{...change,observation:{...change.observation,quote:'嫌珍姨多嘴'}}},
   {...scope,key:'private-text',change:{...change,description:'刘建军心里暗暗嫌珍姨多嘴。'}},
   {...scope,key:'wrong-stage',change:{...change,stageKey:'wrong'}},
   {...scope,key:'visible',change},
  ]};
 });
 const result=await generateAtmosphere({...input,dependencies});
 assert.equal(result.state.developmentAtmospheres.length,1);
 const wind=result.state.developmentAtmospheres[0];
 assert.equal(wind.description,'门口位置腾开后，做事轻松一些。');
 assert.equal(wind.emotion.values.dissatisfaction,45);
 assert.equal(wind.emotion.ongoing,false);
});

test('controller receives the saved wind and carries an exactly linked settlement and clock into the next batch',async()=>{
 const quote='小林公开说明：“旧欠款结清了。”', input=sample(quote);
 let stored={data:{...input.state,automaticDevelopmentEnabled:true},revision:1},seq=3;
 const calls=[],reads=[];
 const repo=createWorldRepository({async get(){return structuredClone(stored);},async put(_c,_r,data,expected){
  assert.equal(expected,stored.revision);
  const next=structuredClone(data);
  if(expected===1)next.developmentAtmospheres[0].description='保存后的公开气氛。';
  stored={data:next,revision:expected+1};
  return structuredClone(stored);
 }});
 const app=createPeopleWorld({directory:{readPeople:()=>({status:'ready',scopeId:'q',people,message:''})},repository:repo,
  history:{readStoryHistory({fromSeq}){return{status:fromSeq>seq?'empty':'ready',throughSeq:seq,latestAiSeq:seq+1,turns:fromSeq>seq?[]:seq===3?input.story.turns:[{seq:5,isUser:false,text:'小林重提结清旧欠款。<!-- QQJ-end 2025-11-06T12:00:00 -->'}]};}},
  story:{readStoryInput(){throw Error('legacy');}},
  config:{getProfile:async()=>({url:'https://offline.invalid',key:'fixture',model:'fixture'})},
  materials:deps({},reads).materials,
  createModelRequester:profiles=>createModelRequester(profiles,{async generate(_profile,messages,_max,_signal,onStarted){
   onStarted?.();
   const wire=JSON.parse(messages[1].content),taste=Boolean(wire.changes);
   calls.push(taste?'taste':'hearing');
   if(seq===5){
    if(!taste){
     const linked=wire.events.find(e=>e.description==='旧欠款结清。');
     assert.equal(wire.previousStoryTime.text,'2025-11-06T11:00:00');
     assert.equal(linked.activityId,'old');
    }
    return JSON.stringify({quietReason:'没有新的变动。'});
   }
   if(taste)return JSON.stringify({stages:[{...stage,onstagePersonIds:['P1']}],atmosphereUpdates:[{key:'wind',circleRef:'foundation:group:shops',personIds:['P1','P2'],
    change:{description:'欠款结清后，街坊一起松了口气。',stageKey:'s',sourceSeqs:[3],assertedPersonIds:[],assertsUser:false,
     observation:{sourceSeq:3,quote,participantIds:['P1']}}}]});
   assert.equal(wire.atmospheres[0].description,'保存后的公开气氛。');
   return JSON.stringify({calibration:{facts:[{description:'旧欠款结清。',activityId:'old',participantIds:['P1'],sourceSeqs:[3]}],
    activityUpdates:[{id:'old',change:{status:'completed'},sourceSeqs:[3]}]}});
  }}),advancer:{advance(){throw Error('legacy');}}});
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>100});
 await app.refresh();
 await app.startDevelopment();
 assert.equal(app.developmentView.value.error,'');
 assert.equal(stored.data.storyTime.text,'2025-11-06T11:00:00');
 assert.equal(stored.data.events[0].activityId,'old');
 assert.equal(hearingActivities(app.state.value.world)[0].body,'旧欠款结清。');
 seq=5;
 await app.startDevelopment();
 assert.equal(app.developmentView.value.error,'');
 assert.equal(stored.data.storyTime.text,'2025-11-06T12:00:00');
 assert.deepEqual(calls,['taste','hearing','taste','hearing']);
 assert.ok(reads.length<=2);
});

test('history extraction also creates prose-only records and preserves paragraphs with a stable link',()=>{
 const input=sample();
 const next=mergeHistoryBatch({baseline:input.state,candidate:input.state,people,batch:input.story.turns,response:{
  activities:[{key:'new',description:prose,status:'completed',participantIds:[id],sourceSeqs:[3]}],
  events:[{key:'event',activityId:'new',description:prose,participantIds:[id],sourceSeqs:[3]}]
 }});
 assert.equal(next.state.activities.at(-1).description,prose);
 assert.equal(next.state.events.at(-1).description,prose);
 assert.equal(next.state.events.at(-1).activityId,next.state.activities.at(-1).id);
});

test('long-term affinity persists and an old bare ongoing marker no longer holds worry',()=>{
 const old={values:{affinity:29,worry:15},severity:'ordinary',ongoing:true,clock:'2025-11-06T10:00',throughSeq:1,stimulusRefs:[]};
 const later=advanceEmotion(old,'2025-11-08T10:00');
 assert.equal(later.values.affinity,29);
 assert.ok(later.values.worry<1);
});

test('personality is local to the witnessed person while a valid identity change in the same row survives',async()=>{
 const input=sample('小林先核对票据，再把多收的钱退回。');
 const result=await generateDevelopment({...input,dependencies:deps({foundation:{people:[
  {id,identity:'商户',disposition:'逐笔核账，发现多收会主动退回',sourceSeqs:[3]},
  {id:other,identity:'商户',disposition:'也总会逐笔核账',sourceSeqs:[3]},
 ]}})});
 const saved=result.state.foundation.people;
 assert.equal(saved.find(row=>row.id===id).disposition,'逐笔核账，发现多收会主动退回');
 assert.equal(saved.find(row=>row.id===other).identity,'商户');
 assert.equal(saved.find(row=>row.id===other).disposition,'');
});

test('three saved hearings with no changes drop detailed simulation until a concrete wake-up',()=>{
 const input=sample('街上和平时一样。');
 const windows=[3,5,7].map(seq=>({id:'h'+seq,throughSeq:seq,kind:'current',from:start,to:start}));
 input.state={...input.state,processedThroughSeq:7,simulationRanges:[baseline,...windows],activities:[{...old,status:'active',currentStateWindowId:'base'}]};
 const fresh=text=>[{seq:9,isUser:false,text}];
 assert.deepEqual(selectFlowFocus(people,input.state,fresh('街上和平时一样。'),null).activityIds,[]);
 assert.deepEqual(selectFlowFocus(people,input.state,fresh('发票原件已寄到。'),null).activityIds,['old']);
 assert.equal(input.state.activities[0].status,'active');
});
