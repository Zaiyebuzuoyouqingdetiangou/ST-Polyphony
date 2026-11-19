import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {createPeopleWorld}=await import('./people-world.ts');
const {createWorldRepository}=await import('../storage/world-repository.ts');
const {createModelClient,createModelRequester}=await import('../models/client.ts');
const {createWorldSettingsReader}=await import('../host/world-settings.ts');
const {createEmptyState}=await import('../domain/world-state.ts');
const {foundationAsOf}=await import('../domain/world-foundation.ts');
const {selectWorldMemory}=await import('../simulation/world-memory.ts');
const qid='qqj:["scope","q"]',source='world-book:["本书","1"]';
const person=()=>({id:qid,qqjPersonId:qid,displayName:'甲',description:'公开参考',aliases:[],profileMaterialProvided:true,source:{kind:'plugin',id:qid,label:'QQJ'}});
const environment='岛上渡船每日一班，风暴时停航。';
const sentProfile=(role,read)=>({model:`${role}-${read}`,url:`https://${role}.offline.invalid/v1`,key:`fake-${role}-key`});
function fixture({answer,finish='stop',state,people=[person()],emptyStory=false,settingsReader,failSave=false}={}){
 let envelope={revision:1,data:state??createEmptyState('scope')},calls=[],saves=0,bookReads=0,materialReads=0,configReads=0,through=2,fail=failSave;
 const repo=createWorldRepository({async get(){return structuredClone(envelope);},async put(_collection,_id,data,expected){assert.equal(expected,envelope.revision);if(fail){fail=false;throw Error('isolated save failure');}envelope={revision:expected+1,data:structuredClone(data)};saves++;return structuredClone(envelope);}});
 const client=createModelClient({getHeaders:()=>({}),getProcessingPrompt:()=>'',fetchImpl:async(_url,init)=>{
  const payload=JSON.parse(init.body),input=JSON.parse(payload.messages[1].content),system=payload.messages[0].content;
  const construction=system.includes('本次必须返回foundation。');calls.push({input,system,profile:{model:payload.model,url:payload.reverse_proxy,key:payload.proxy_password},construction});
  const content=construction?(typeof answer==='function'?answer(input):answer??{foundation:{people:[{id:'P1',identity:'渡船售票员',interests:'棋类',sourceIds:[]}],groups:[],relations:[],context:[{text:environment,sourceIds:[source]}]}}):{activities:[],events:[],knowledge:[],atmosphereUpdates:[],quietReason:'等待渡船',stages:[]};
  return new Response(JSON.stringify({choices:[{finish_reason:construction?finish:'stop',message:{content:typeof content==='string'?content:JSON.stringify(content)}}]}));
 }});
 function app(){const result=createPeopleWorld({directory:{readPeople:()=>({status:people.length?'ready':'empty',scopeId:'scope',people:structuredClone(people),message:''})},repository:repo,
  history:{readStoryHistory({fromSeq=1}){const end=emptyStory?null:through;return{status:end===null||fromSeq>end?'empty':'ready',throughSeq:end,latestAiSeq:through+1,turns:end===null||fromSeq>end?[]:[{seq:end,isUser:false,text:'已过午后，海风平稳。'}],source:{kind:'chat',id:'scope'},message:''};}},story:{readStoryInput(){throw Error('legacy');}},
  worldSettings:{async read(){bookReads++;return settingsReader?settingsReader.read():{characterDescription:'',books:[{name:'本书',entries:[{id:'1',content:'渡船售票员甲爱下棋。'+environment}]}],partial:false};}},
  materials:{async readForQuestion(){materialReads++;return{status:'empty',message:'',materials:[],routerText:'',coverage:{partial:false}};}},
  config:{async getProfile(role){return sentProfile(role,++configReads);}},createModelRequester:profiles=>createModelRequester(profiles,client),advancer:{advance(){throw Error('legacy');}}});result.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>100});return result;}
 return{app:app(),cold:app,repo,calls,get state(){return envelope.data;},get saves(){return saves;},get bookReads(){return bookReads;},get materialReads(){return materialReads;},next(){through+=2;}};
}
test('construction → repository → cold controller → taste/hearing wire keeps environment and aggregate short fields once',async()=>{
 const f=fixture();await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,1);
 assert.equal(f.state.foundation.context[0].text,environment);assert.equal(f.state.foundation.people[0].interests,'棋类');assert.equal(f.state.processedThroughSeq,null);
 const app=f.cold();await app.refresh();await app.startDevelopment();assert.equal(app.developmentView.value.error,'');assert.equal(f.calls.length,3);
 for(const call of f.calls.slice(1)){
  const data=call.input.background??call.input;assert.equal(data.foundation.context[0].text,environment);assert.equal(data.foundation.people[0].interests,'棋类');
  assert.doesNotMatch(data.people[0].description,/棋类|渡船售票员/);assert.match(data.people[0].description,/公开参考/);
 }
 assert.deepEqual(f.calls.map(call=>call.profile),[sentProfile('primary',1),sentProfile('secondary',2),sentProfile('primary',3)]);
 assert.equal(f.bookReads,1);f.next();await app.startDevelopment();assert.equal(f.calls.length,5);assert.equal(f.bookReads,1);
});
test('first flow prepares public materials once before construction and reuses them for taste/hearing',async()=>{
 const f=fixture();await f.app.refresh();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,3);
 assert.deepEqual(f.calls.map(call=>call.profile),[sentProfile('primary',1),sentProfile('secondary',2),sentProfile('primary',3)]);
 assert.equal(f.app.developmentView.value.modelCalls,3);
 assert.ok(f.calls[0].input.materials.length>0);assert.equal(f.materialReads,1);assert.equal(f.bookReads,1);assert.equal(f.state.automaticDevelopmentEnabled,true);
 assert.doesNotMatch(f.calls[0].system,/atmosphereUpdates每条给|activities:\[/);
});
test('context alone accepts complete rows, bad context and relations stay local, legacy schema1 cold reads',async()=>{
 const f=fixture({people:[],emptyStory:true,answer:{foundation:{context:[null,{text:17},{text:''},{text:environment,sourceIds:['typo']}],relations:[{key:'R',fromPersonId:'missing',toPersonId:'also-missing'}]}}});
 await f.app.refresh();assert.equal(f.app.state.value.error,'');await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.state.foundation.context.length,1);assert.equal(f.state.foundation.relations.length,0);
 assert.match(f.state.foundation.context[0].sources[0].id,/^construction-reference:/);const saved=await f.repo.load('scope');assert.equal(saved.state.foundation.context[0].text,environment);
});
test('partial people, new keys, useful group with a bad member and bad optional sources preserve real references',async()=>{
 const f=fixture({answer:{foundation:{people:[{id:'P1',identity:'船员',life:{bad:true},sourceIds:[source,'typo']},{key:'N1',name:'乙',interests:'修船',sourceIds:[]},{id:'P99',name:'未知',identity:'不得猜'}],groups:[{key:'G1',name:'渡船同事',description:'共同排班',members:[{personId:'P1'},{personId:'N1'},{personId:'P99'}],sourceIds:['typo']}],relations:[{key:'R1',fromPersonId:'P1',toPersonId:'N1',fromRole:'同事',toRole:'同事',sourceIds:[]},{key:'R2',fromPersonId:'P1',toPersonId:'P99',fromRole:'?',toRole:'?'}],context:[{text:environment}]}}});
 await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');const foundation=f.state.foundation;assert.equal(foundation.people.length,2);assert.equal(foundation.groups.length,1);assert.equal(foundation.groups[0].members.length,2);assert.equal(foundation.relations.length,1);assert.equal(foundation.people[0].sources[0].id,source);assert.equal(foundation.people[0].life,'');assert.equal(foundation.context.length,1);
 assert.equal(foundation.relations[0].toPersonId,foundation.people[1].id);
});
test('explicit manual clears protect identity, disposition and interests without losing other accepted short fields',async()=>{
 const p={...person(),identityDescription:'',manualProfile:{occupation:'',personality:'',likes:''},presentationSource:{personality:'',relations:''}};
 const f=fixture({people:[p],answer:{foundation:{people:[{id:'P1',identity:'旧职业',disposition:'旧性格',interests:'旧兴趣',motivations:'长期关切',life:'轮班',sourceIds:[]}],groups:[],relations:[]}}});
 await f.app.refresh();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');for(const call of f.calls.slice(1)){const data=call.input.background??call.input;const row=data.foundation.people[0];assert.equal(row.identity,'');assert.equal(row.disposition,'');assert.equal(row.interests,'');assert.equal(row.motivations,'长期关切');assert.equal(row.life,'轮班');assert.doesNotMatch(JSON.stringify(data),/旧职业|旧性格|旧兴趣/);}
});
test('context event basis selects its dependency closure and historical projection excludes future text',()=>{
 const fields={throughSeq:2,windowId:'w2',people:[],groups:[],relations:[],context:[{id:'early',text:'旧环境已改',sources:[],basisEventIds:['origin'],establishedWindowId:'w1',currentStateWindowId:'w2'},{id:'future',text:'未来环境',sources:[],establishedWindowId:'w2',currentStateWindowId:'w2'}]};
 const before=foundationAsOf(fields,new Set(['w1']));assert.deepEqual(before.context,[]);
 const event=(id,links=[])=>({id,activityId:null,title:id,description:id,participantIds:['elsewhere'],sources:[],storyTime:null,eventLinks:links});
 const state={...createEmptyState('scope'),foundation:fields,events:[event('root'),event('origin',[{eventId:'root',kind:'caused-by'}]),...Array.from({length:10},(_,i)=>event('noise'+i))]};
 const memory=selectWorldMemory([],state);assert.deepEqual(memory.events.map(row=>row.id),['root','origin']);
});
for(const [name,answer]of [
 ['top-level',{people:[{id:'P1',identity:'船员'}],context:[{text:environment}]}],
 ['known wrapper',{result:{data:{worldConstruction:{foundation:{people:[{id:'P1',identity:'船员'}],context:[{text:environment}]}}}}}],
 ['fence','构筑结果：\n```json\n{"foundation":{"people":[{"id":"P1","identity":"船员"}],"context":[{"text":"'+environment+'"}]}}\n```'],
 ['Chinese introduction','以下是根据提供资料整理出的世界基础：\n```json\n{"foundation":{"people":[{"id":"P1","identity":"船员"}],"context":[{"text":"'+environment+'"}]}}\n```'],
 ['English introduction','Here is the constructed world:\n```json\n{"foundation":{"people":[{"id":"P1","identity":"船员"}],"context":[{"text":"'+environment+'"}]}}\n```'],
 ['truncated tail','{"foundation":{"people":[{"id":"P1","identity":"船员"}],"context":[{"text":"'+environment+'"},{"text":"未闭合'],
 ])test('production construction normalization: '+name,async()=>{const f=fixture({answer,finish:name==='truncated tail'?'length':'stop'});await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.state.foundation.people[0].id,qid);assert.equal(f.state.foundation.context[0].text,environment);assert.equal(f.calls.length,1);});
for(const [name,answer]of [
 ['nested example',{explanation:{foundation:{people:[{id:'P1',identity:'示例'}]}}}],
 ['prose example','例如：```json\n{"foundation":{"people":[{"id":"P1","identity":"示例"}]}}\n```'],
 ['two answers','{"foundation":{"people":[{"id":"P1","identity":"甲"}]}}\n{"foundation":{"people":[{"id":"P1","identity":"乙"}]}}'],
 ['conflicting wrappers',{result:{foundation:{people:[{id:'P1',identity:'甲'}]}},output:{foundation:{people:[{id:'P1',identity:'乙'}]}}}],
 ['duplicate foundation','{"foundation":{"people":[{"id":"P1","identity":"甲"}]},"foundation":{"people":[{"id":"P1","identity":"乙"}]}}'],
 ['no closed record','{"foundation":{"people":[{"id":"P1","identity":"半条'],
 ['unknown identity',{foundation:{people:[{id:'P77',name:'甲',identity:'不猜姓名'}]}}],
 ['schema placeholders',{foundation:{people:[{key:'<新人物唯一键>',name:'<姓名>',identity:'<身份职责>'}],groups:[],relations:[],context:[{text:'<影响生活的环境及其条件>'}]}}],
 ])test('production construction rejects '+name+' without save or progress',async()=>{const f=fixture({answer});await f.app.refresh();await f.app.constructWorld();assert.ok(f.app.developmentView.value.error);assert.equal(f.saves,0);assert.equal(f.state.processedThroughSeq,null);assert.equal(f.state.foundation,undefined);});
test('length success is construction-only; HTTP error, empty and cancellation preserve their real boundary',async()=>{
 const profile={url:'https://offline.invalid',key:'fixture',model:'m'};
 for(const task of ['world-construction','atmosphere','development']){const client=createModelClient({getProcessingPrompt:()=>'',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"foundation":{"context":[{"text":"可用"}]}}'}}]}))});const work=createModelRequester({primary:profile,secondary:profile},client).request({task,instructions:'',input:{}});if(task==='world-construction')assert.ok(await work);else await assert.rejects(work,error=>error.code==='output_truncated');}
 for(const [status,body,code]of [[401,{error:{message:'denied'}},'http_error'],[200,{choices:[{finish_reason:'length',message:{content:''}}]},'empty_response']]){let count=0;const client=createModelClient({getProcessingPrompt:()=>'',fetchImpl:async()=>{count++;return new Response(JSON.stringify(body),{status});}});await assert.rejects(createModelRequester({primary:profile,secondary:profile},client).request({task:'world-construction',instructions:'',input:{}}),error=>error.code===code);assert.equal(count,1);}
 const abort=new AbortController();abort.abort();let count=0;const client=createModelClient({fetchImpl:async()=>{count++;throw Error('never');}});await assert.rejects(createModelRequester({primary:profile,secondary:profile},client).request({task:'world-construction',instructions:'',input:{},signal:abort.signal}));assert.equal(count,0);
});
test('saved construction candidate retries save with no repeated model or material preparation',async()=>{const f=fixture({failSave:true});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.calls.length,1);assert.equal(f.app.developmentView.value.canSave,true);await f.app.saveDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,3);assert.equal(f.materialReads,1);assert.equal(f.state.foundation.context[0].text,environment);});
test('embedded-only full conditions and long prose enter the actual construction request',async()=>{
 const content='文'.repeat(147823)+'{{char}} <%= value %>';
 const settingsReader=createWorldSettingsReader({getContext:()=>({extensionSettings:{},characterId:0,characters:[{data:{character_book:{name:'内嵌',entries:[{id:7,enabled:true,content,keys:['船'],secondary_keys:['风'],selective:true,extensions:{selectiveLogic:1,useProbability:true,probability:30}},{id:8,enabled:false,content:'禁用'}]}}}]})});
 const f=fixture({settingsReader,people:[],emptyStory:true,answer:{foundation:{context:[{text:environment}]}}});await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');const entries=f.calls[0].input.worldSettings.books[0].entries;assert.equal(entries.length,1);assert.equal(entries[0].content,content);assert.deepEqual(entries[0].keys,['船']);assert.equal(entries[0].probability,30);
});
test('external primary wins; excluded books never load; failed external never falls back to stale embedded',async()=>{
 const loaded=[];const context={extensionSettings:{'schedule-planner':{wiExcludeBooks:['Excluded']}},characterId:0,characters:[{data:{extensions:{world:'primary'},character_book:{name:'stale',entries:[{id:1,enabled:true,content:'STALE'}]}}}],getCharaAuxWorlds:()=>['primary','good','Excluded'],chatWorldInfo:{getNames:()=>['good']},getWorldInfoNames:()=>[],loadWorldInfo:async name=>{loaded.push(name);if(name==='primary')throw Error('missing');return{entries:{1:{uid:1,content:'GOOD',key:['条件'],constant:false}}};}};
 const settings=await createWorldSettingsReader({getContext:()=>context}).read();assert.deepEqual(loaded,['primary','good']);assert.equal(settings.partial,true);assert.deepEqual(settings.books.map(book=>book.name),['good']);assert.doesNotMatch(JSON.stringify(settings),/STALE/);
});
test('old schema1 foundation without context refreshes with zero calls and next flow remains two requests',async()=>{
 const state={...createEmptyState('scope'),processedThroughSeq:1,automaticDevelopmentEnabled:true,foundation:{throughSeq:1,windowId:'old',people:[{id:qid,name:'甲',aliases:[],identity:'船员',motivations:'',disposition:'',interests:'',life:'',sources:[{kind:'world-book',id:source,label:'本书'}],establishedWindowId:'old',currentStateWindowId:'old'}],groups:[],relations:[]}};
 const f=fixture({state});await f.app.refresh();assert.equal(f.calls.length,0);assert.equal(f.bookReads,0);assert.equal(f.state.foundation.context,undefined);await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,2);assert.equal(f.bookReads,0);assert.ok(f.calls.every(call=>!call.construction));
});
test('useful group prose and a one-sided explicit relation survive missing optional fields; broken explicit IDs never become new people',async()=>{
 const f=fixture({answer:{foundation:{people:[{id:'P1',identity:'船员'},{id:null,key:'BAD',name:'坏身份',identity:'不得建'},{key:'N1',name:'乙',identity:'同事'}],groups:[{key:'G',name:'渡船团队',description:'共同排班与交接'}],relations:[{key:'R',fromPersonId:'P1',toPersonId:'N1',fromRole:'师傅'}]}}});
 await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.state.foundation.people.length,2);assert.equal(f.state.foundation.groups.length,1);assert.equal(f.state.foundation.relations.length,1);assert.equal(f.state.foundation.relations[0].toRole,'');
});
test('helper-selected external primary suppresses embedded copy, including failed and excluded external reads',async()=>{
 const original=globalThis.TavernHelper;globalThis.TavernHelper={getCharLorebooks:()=>({primary:'live',additional:[]})};
 try{const settings=await createWorldSettingsReader({getContext:()=>({extensionSettings:{},characterId:0,characters:[{data:{character_book:{name:'old',entries:[{id:1,content:'旧副本'}]}}}],getWorldInfoNames:()=>[],loadWorldInfo:async()=>{throw Error('offline');}})}).read();assert.equal(settings.books.length,0);assert.equal(settings.partial,true);}finally{globalThis.TavernHelper=original;}
});
test('reconstruction with no useful result preserves existing clock, permission, facts and progress; explicit no-change uses old foundation',async()=>{
 const state={...createEmptyState('scope'),processedThroughSeq:8,automaticDevelopmentEnabled:true,storyTime:{text:'晚间',source:{kind:'manual',id:'clock',label:''}},developmentOnstagePersonIds:[qid],foundation:{throughSeq:8,windowId:'old',people:[],groups:[],relations:[],context:[{id:'c',text:environment,sources:[],establishedWindowId:'old',currentStateWindowId:'old'}]}};
 const bad=fixture({state:structuredClone(state),answer:{foundation:{people:[{id:'P99',identity:'坏'}]}}});await bad.app.refresh();await bad.app.constructWorld();assert.equal(bad.saves,0);assert.deepEqual(bad.state,state);
 const unchanged=fixture({state:structuredClone(state),answer:{foundation:{people:[],groups:[],relations:[],context:[]},quietReason:'既有基础不变'}});await unchanged.app.refresh();await unchanged.app.constructWorld();assert.equal(unchanged.app.developmentView.value.error,'');for(const key of ['foundation','processedThroughSeq','automaticDevelopmentEnabled','storyTime','developmentOnstagePersonIds','events','knowledge','activities'])assert.deepEqual(unchanged.state[key],state[key]);
});
test('accepted construction using exact public profile sources remains short foundation in later wire',async()=>{
 const f=fixture({answer:{foundation:{people:[{id:'P1',identity:'船员',interests:'棋类',sourceIds:[qid]}],groups:[],relations:[]}}});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');for(const call of f.calls.slice(1)){const data=call.input.background??call.input;assert.equal(data.foundation.people[0].interests,'棋类');assert.doesNotMatch(data.people[0].description,/棋类/);}
});
test('cold optional context corruption stays local while valid environment and old foundation can flow',async()=>{
 const row={id:'c',text:environment,sources:[{kind:'world-book',id:source,label:'本书'}],establishedWindowId:'old',currentStateWindowId:'old'};
 for(const context of [{},[null,row],[{...row,id:'bad',sources:null},row]]){
  const state={...createEmptyState('scope'),processedThroughSeq:1,automaticDevelopmentEnabled:true,foundation:{throughSeq:1,windowId:'old',people:[],groups:[],relations:[],context}};
  const f=fixture({state});await f.app.refresh();assert.equal(f.app.state.value.error,'');assert.equal(f.calls.length,0);await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,2);if(Array.isArray(context))assert.ok(f.calls[0].input.background.foundation.context.some(item=>item.text===environment));
 }
});
test('duplicate new person keys isolate ambiguous identities and edges while keeping unrelated content',async()=>{
 const f=fixture({answer:{foundation:{people:[{id:'P1',identity:'船员'},{key:'N1',name:'乙',identity:'船医'},{key:'N1',name:'丙',identity:'厨师'}],groups:[{key:'G',name:'渡船团队',description:'轮班后勤',members:[{personId:'P1'},{personId:'N1'}]}],relations:[{key:'R',fromPersonId:'P1',toPersonId:'N1',fromRole:'同事'}],context:[{text:environment}]}}});
 await f.app.refresh();await f.app.constructWorld();assert.equal(f.app.developmentView.value.error,'');assert.deepEqual(f.state.foundation.people.map(row=>row.id),[qid]);assert.deepEqual(f.state.foundation.groups[0].members.map(row=>row.personId),[qid]);assert.equal(f.state.foundation.relations.length,0);assert.equal(f.state.foundation.context[0].text,environment);
});
