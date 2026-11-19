import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
let server,hearingActivities,projectWorldState,applyDevelopment;test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({hearingActivities}=await server.ssrLoadModule('/src/ui/hearing-activities.ts'));({projectWorldState}=await server.ssrLoadModule('/src/domain/world-state.ts'));({applyDevelopment}=await server.ssrLoadModule('/src/simulation/development.ts'));});test.after(()=>server?.close());
const task=(id,status='active',participantIds=['p'])=>({id,title:'同名事务',description:id,status,participantIds,sources:[]});
const event=(id,activityId,sources=[{kind:'simulation',id:'generated',label:''}],extra={})=>({id,activityId,title:id,description:id,participantIds:[],storyTime:null,sources,...extra});
const world={id:'scope',people:[{id:'p',name:'甲'},{id:'q',name:'乙'}],activities:[task('a')],events:[],knowledge:[]};
test('latest progress is saved-order effective self-created content explicitly belonging to this activity',()=>{const rows=hearingActivities({...world,events:[event('old','a'),event('new','a'),event('body','a',[{kind:'chat',id:'history-floor:8',label:''}]),event('manual','a',[{kind:'manual',id:'note',label:''}]),event('wrong','b'),event('world',null),event('corrected','a',undefined,{correction:{byEventId:'truth',reason:''}})]});assert.equal(rows[0].latestProgress.id,'new');});
test('legacy self-created chat sources remain supported, body facts take precedence and other scopes do not match',()=>{const rows=hearingActivities({...world,events:[event('legacy','a',[{kind:'chat',id:'scope:8',label:''}]),event('other-scope','a',[{kind:'chat',id:'different:9',label:''}]),event('body-plus-simulation','a',[{kind:'chat',id:'history-floor:9',label:''},{kind:'simulation',id:'old',label:''}])]});assert.equal(rows[0].latestProgress.id,'legacy');});
test('without a reliable window hearing uses phase order and retains exact directory membership',()=>{const rows=hearingActivities({...world,activities:[task('waiting','waiting',['q','missing']),task('a'),task('done','completed')],events:[event('same-title-wrong-id','other')]});assert.deepEqual(rows.map(r=>r.activity.id),['a','waiting','done']);assert.deepEqual(rows[1].people.map(p=>p.id),['q']);assert.equal(rows[0].latestProgress,null);assert.equal(rows[1].latestProgress,null);});
test('completed offscreen work remains a full hearing row with its exact effective generated result',()=>{const rows=hearingActivities({...world,activities:[task('done','completed'),task('other','waiting')],events:[event('finished-result','done'),event('wrong-same-title','elsewhere'),event('body','done',[{kind:'chat',id:'history-floor:7',label:''}])]});assert.equal(rows[1]?.activity.id,'done');assert.equal(rows[1]?.activity.status,'completed');assert.equal(rows[1]?.latestProgress.id,'finished-result');});
test('the single hearing body is the full latest result or otherwise the factual activity checkpoint',()=>{const [result,checkpoint]=hearingActivities({...world,activities:[task('done','completed'),task('factual','completed')],events:[event('generated-result','done')]});assert.equal(result.body,'generated-result。');assert.equal(result.activity.description,'done');assert.equal(result.latestProgress.id,'generated-result');assert.equal(checkpoint.body,'factual。');assert.equal(checkpoint.latestProgress,null);});
test('hearing completes sentence endings for both body sources without changing saved text',()=>{const value={...world,activities:[{...task('a'),description:'仍在等待接听'},{...task('b'),description:'活动概况原文'}],events:[{...event('result','b'),description:'已经整理完成'}]},original=structuredClone(value);const rows=hearingActivities(value);assert.equal(rows[0].body,'仍在等待接听。');assert.equal(rows[1].body,'已经整理完成。');assert.deepEqual(value,original);});
test('existing Chinese/English punctuation, ellipsis and closing quotes stay intact; empty body falls back to a legacy title',()=>{for(const text of ['已经完成。','Already done.','继续吗？','Ready?','正在等……','“还在等……”','He asked “Ready?”','']){const [row]=hearingActivities({...world,activities:[{...task('a'),description:text}]});assert.equal(row.body,text||'同名事务。');}assert.equal(hearingActivities({...world,activities:[{...task('a'),title:undefined,description:''}]})[0].body,'');});
test('hearing omits pure onstage live cards and keeps their completed lines available for 余音',()=>{
 const value={...world,developmentOnstagePersonIds:['p','q'],activities:[
  {...task('body','active',['p']),sources:[{kind:'chat',id:'history-floor:8',label:''}]},
  {...task('generated','completed',['p','q']),sources:[{kind:'simulation',id:'generated',label:''}]},
  {...task('manual','waiting',['q']),sources:[{kind:'manual',id:'note',label:''}]},
  task('mixed','waiting',['p','outside']),task('empty','planned',[]),task('unknown','active',['missing']),
 ],events:[event('kept-result','mixed')],people:[...world.people,{id:'outside',name:'场外人物'}]},before=structuredClone(value);
 const rows=hearingActivities(value);assert.deepEqual(rows.map(row=>row.activity.id),['unknown','mixed','empty','generated']);
 assert.deepEqual(rows[1].activity.participantIds,['p','outside']);assert.deepEqual(rows[1].people.map(person=>person.id),['p','outside']);assert.equal(rows[1].latestProgress.id,'kept-result');assert.deepEqual(value,before);
});
test('missing or empty current onstage ownership keeps every activity; unknown participants are not guessed',()=>{
 for(const developmentOnstagePersonIds of [undefined,[]])assert.deepEqual(hearingActivities({...world,developmentOnstagePersonIds}).map(row=>row.activity.id),['a']);
 const mixed=task('unknown-mixed','active',['p','missing']);assert.deepEqual(hearingActivities({...world,developmentOnstagePersonIds:['p'],activities:[mixed]}).map(row=>row.activity.participantIds),[['p','missing']]);
});
test('the production snapshot projects current onstage ownership while retaining all activity, event and knowledge data',()=>{
 const state={schemaVersion:1,scopeId:'scope',storyTime:null,processedThroughSeq:8,developmentOnstagePersonIds:['p'],activities:[task('onstage'),task('offstage','waiting',['q'])],events:[event('body','onstage',[{kind:'chat',id:'history-floor:8',label:''}])],knowledge:[{personId:'p',eventId:'body',reason:'正文已知',sources:[]}]},before=structuredClone(state);
 const snapshot=projectWorldState('scope',world.people,state);assert.deepEqual(snapshot.developmentOnstagePersonIds,['p']);assert.deepEqual(snapshot.activities,state.activities);assert.deepEqual(snapshot.events,state.events);assert.deepEqual(snapshot.knowledge,state.knowledge);assert.deepEqual(hearingActivities(snapshot).map(row=>row.activity.id),['offstage']);assert.deepEqual(state,before);
});
test('earlier progress follows the exact saved activity ID and the same eligibility as the current body',()=>{
 const bodySource=[{kind:'chat',id:'history-floor:8',label:''}];
 const value={...world,activities:[task('a'),task('b')],events:[
  {...event('legacy','a',[{kind:'chat',id:'scope:6',label:''}]),description:'',title:'旧档仅有标题'},
  event('associated-body','a',bodySource,{simulationWindowId:'hearing-window'}),
  event('plain-body','a',bodySource),
  event('corrected','a',undefined,{correction:{byEventId:'truth',reason:''}}),
  event('manual','a',[{kind:'manual',id:'note',label:''}]),
  event('latest','a'),event('same-title-other-id','b'),event('world-only',null),
 ]},before=structuredClone(value);
 const [current,other]=hearingActivities(value);
 assert.equal(current.latestProgress.id,'latest');
 assert.deepEqual(current.earlierProgress,[{id:'associated-body',body:'associated-body。'},{id:'legacy',body:'旧档仅有标题。'}]);
 assert.deepEqual(other.earlierProgress,[]);
 assert.deepEqual(value,before);
});

const point={id:'b',text:'当前',sourceSeqs:[8]};
const savedWindow=(id,throughSeq,extra={})=>({id,kind:'current',from:point,to:point,throughSeq,...extra});
const orderedIds=snapshot=>hearingActivities(snapshot).map(row=>row.activity.id);
test('autonomous hearing skips a closed line and still advances a waiting line',()=>{
 const state={schemaVersion:1,scopeId:'scope',storyTime:null,processedThroughSeq:8,events:[],knowledge:[],
  activities:[task('closed','completed'),task('waiting','waiting')]};
 const people=[{id:'p',displayName:'甲',aliases:[],description:'',source:{kind:'plugin',id:'p',label:''}}];
 const story={status:'ready',throughSeq:9,turns:[{seq:9,isUser:false,text:'外面开始放晴。'}],source:{kind:'chat',id:'scope'}};
 const claims={stageKey:'now',participantIds:['p'],assertedPersonIds:['p'],assertsUser:false};
 const {state:saved}=applyDevelopment({people,state,story,initial:false},{
  stages:[{key:'now',sourceSeqs:[9],onstagePersonIds:[],offstagePersonIds:[]}],
  activities:[{id:'closed',status:'active',description:'擅自重开旧事项',...claims}],
  events:[{key:'closed-step',activityId:'closed',description:'擅自续写旧事项',...claims},
   {key:'wait-step',activityId:'waiting',description:'钥匙送到门口',...claims}],
 });
 assert.deepEqual(saved.activities.find(row=>row.id==='closed'),state.activities[0]);
 assert.deepEqual(saved.events.map(row=>row.activityId),['waiting']);
});
test('the actual hearing save ranks both groups, with a status-only change and a progress-only result',()=>{
 const older=savedWindow('earlier',8);
 const state={schemaVersion:1,scopeId:'scope',storyTime:null,processedThroughSeq:8,currentTimeStartedThroughSeq:8,automaticDevelopmentEnabled:true,simulationRanges:[older],events:[],knowledge:[],activities:[
  task('stale-done','completed'),task('fresh-done','active'),task('stale-plan','planned'),
  task('fresh-wait','waiting'),task('fresh-active','planned'),task('stale-active'),task('stale-wait','waiting'),
 ]};
 const people=[{id:'p',displayName:'甲',aliases:[],description:'',source:{kind:'plugin',id:'p',label:''}}];
 const story={status:'ready',throughSeq:9,turns:[{seq:9,isUser:false,text:'街上无人提及甲。'}],source:{kind:'chat',id:'scope'}};
 const claims={stageKey:'now',participantIds:['p'],assertedPersonIds:['p'],assertsUser:false};
 const {state:saved,window}=applyDevelopment({people,state,story,initial:false},{
  stages:[{key:'now',sourceSeqs:[9],onstagePersonIds:[],offstagePersonIds:[]}],
  activities:[{id:'fresh-done',status:'completed',...claims},{id:'fresh-active',status:'active',...claims},{key:'plan',description:'改日清点仓库',status:'planned',...claims}],
  events:[{key:'step',activityId:'fresh-wait',description:'已清点工具，仍等钥匙',...claims}],
 });
 assert.equal(saved.lastHearingWindow.id,window.id);
 assert.deepEqual(saved.activities.find(a=>a.id==='fresh-wait'),state.activities.find(a=>a.id==='fresh-wait'));
 assert.equal(saved.events[0].simulationWindowId,window.id);
 assert.equal(saved.activities.find(a=>a.id==='fresh-done').currentStateWindowId,window.id);
 const plan=saved.activities.find(a=>a.description==='改日清点仓库').id;
 const expected=['fresh-active','fresh-wait',plan,'fresh-done','stale-active','stale-wait','stale-plan','stale-done'];
 assert.deepEqual(orderedIds(projectWorldState('scope',world.people,saved)),expected);

 const ref=savedWindow('taste',9,{referenceSources:[]}), baseline=savedWindow('baseline',10,{purpose:'baseline',referenceSources:[]});
 const later={...saved,processedThroughSeq:10,simulationRanges:[...saved.simulationRanges,ref,baseline],
  activities:saved.activities.map(a=>a.id==='fresh-active'?{...a,currentStateWindowId:baseline.id}:a),
  events:[...saved.events,event('corrected','stale-done',undefined,{simulationWindowId:window.id,correction:{byEventId:'truth',reason:''}})]};
 assert.deepEqual(orderedIds(projectWorldState('scope',world.people,later)),expected);
});

test('legacy hearing uses an unambiguous successful cutoff with effective progress, otherwise phase order and stable ties',()=>{
 const activities=[task('stale-one'),{...task('fresh','completed'),currentStateWindowId:'heard'},task('stale-two'),task('fresh-wait','waiting')];
 const body=[{kind:'chat',id:'history-floor:8',label:''}];
 const heard=savedWindow('heard',8),taste=savedWindow('taste',8,{referenceSources:[]});
 const state={schemaVersion:1,scopeId:'scope',storyTime:null,processedThroughSeq:11,currentTimeStartedThroughSeq:8,automaticDevelopmentEnabled:true,simulationRanges:[heard,taste],activities,knowledge:[],
  events:[event('proof','fresh-wait',body,{simulationWindowId:heard.id}),event('uncoupled-body','stale-one',body)]};
 const ids=value=>orderedIds(projectWorldState('scope',world.people,value));
 assert.deepEqual(ids(state),['fresh-wait','fresh','stale-one','stale-two']);
 assert.deepEqual(ids({...state,simulationRanges:[...state.simulationRanges,savedWindow('another',8)]}),['stale-one','stale-two','fresh-wait','fresh']);
 assert.deepEqual(ids({...state,currentTimeStartedThroughSeq:undefined}),['stale-one','stale-two','fresh-wait','fresh']);
});
