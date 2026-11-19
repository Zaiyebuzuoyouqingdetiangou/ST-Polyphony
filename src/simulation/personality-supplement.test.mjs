import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {applyFoundation,needsFoundationSupplement}=await import('./foundation.ts');
const {mergeWorldPeople,foundationForInput}=await import('../domain/world-foundation.ts');
const {prepareDevelopment,developmentContext,applyDevelopment}=await import('./development.ts');
const {atmosphereContext}=await import('./atmosphere.ts');
const {presentationRequests,presentationBasis}=await import('../domain/presentation.ts');
const {createEmptyState,projectWorldState}=await import('../domain/world-state.ts');
const {projectSourcePerson}=await import('../domain/source-people.ts');
const {smilePreset}=await import('../visuals/presets.ts');
const {createPeopleWorld}=await import('../application/people-world.ts');
const {createWorldRepository}=await import('../storage/world-repository.ts');
const {createModelRequester}=await import('../models/client.ts');
const qid='qqj:["scope","p"]';
const publicSource={kind:'plugin',id:qid,label:'QQJ人物资料'},book={kind:'world-book',id:'world-book:["书","p"]',label:'许可设定'};
const person=(extra={})=>({id:qid,qqjPersonId:qid,displayName:'林青',aliases:[],description:'当前公开资料',profileMaterialProvided:true,presentationSource:{personality:'',relations:'identityRelations: 与乙共事'},source:publicSource,...extra});
const seed=(disposition='',sources=[book])=>({id:qid,name:'林青',aliases:[],identity:'店主',motivations:'',disposition,interests:'',life:'',sources,establishedWindowId:'base',currentStateWindowId:'base'});
const state=(disposition='',extra={})=>({...createEmptyState('scope'),processedThroughSeq:1,automaticDevelopmentEnabled:true,foundation:{throughSeq:1,windowId:'base',people:[seed(disposition)],groups:[],relations:[]},...extra});
const story={status:'ready',message:'',throughSeq:2,turns:[{seq:2,isUser:false,text:'时间过了一会儿，店里继续营业。'}],source:{kind:'chat',id:'story',label:'正文'}};
const window={id:'w',kind:'current',throughSeq:2,from:{id:'t',text:'当前',sourceSeqs:[2]},to:{id:'t',text:'当前',sourceSeqs:[2]}};
const deps={materials:{async readForQuestion(){return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false}};}}};
test('empty accepted personality stays explicitly pending without requesting all books each round',async()=>{
 for(const p of [person(),person({manualProfile:{personality:''}})]){
  const s=state(),people=mergeWorldPeople([p],s);let books=0;
  const input={people,state:s,story:{...story,turns:[{...story.turns[0],text:'林青的店里继续营业。'}]},initial:false};assert.equal(needsFoundationSupplement(people,s),false);
  for(let round=0;round<2;round++){
   const prepared=await prepareDevelopment({...input,dependencies:{...deps,worldSettings:{async read(){books++;return{books:[],characterDescription:'',partial:false};}}}});
   const expected=p.manualProfile?[]:[qid];assert.deepEqual(developmentContext(input,prepared).foundationPersonalityPendingPersonIds,expected);assert.deepEqual(atmosphereContext(input,prepared).foundationPersonalityPendingPersonIds,expected);
  }
  assert.equal(books,0);
 }
});
test('blank, omitted or malformed personality never erases the old core; manual decisions and clears stay authoritative',()=>{
 for(const value of ['', '   ',null,{},undefined]){
  const s=state('遇事先核实，表达克制。');const built=applyFoundation({people:[person()],state:s,story},{people:[{id:qid,...(value===undefined?{}:{disposition:value}),sourceSeqs:[2]}]},window);
  assert.equal(built.foundation.people[0].disposition,s.foundation.people[0].disposition);
 }
 for(const manual of ['', '人工指定：坦率直言。']){
  const p=person({manualProfile:{personality:manual},presentationSource:{personality:manual,relations:''}}),s=state('旧自动性格');
  const built=applyFoundation({people:[p],state:s,story},{people:[{id:qid,disposition:'模型擅改的另一种性格',sourceSeqs:[2]}]},window);
  assert.equal(built.foundation.people[0].disposition,'旧自动性格');assert.equal(foundationForInput(built.foundation,[p]).people[0].disposition,manual);
 }
});
test('accepted foundation fills empty public personality and survives repeated merges',()=>{
 const p=person(),s=state('细致耐心，习惯先确认。'),merged=mergeWorldPeople([p],s)[0];
 assert.equal(merged.presentationSource.personality,s.foundation.people[0].disposition);assert.equal(merged.presentationSource.relations,p.presentationSource.relations);
 const next=state('细致耐心，遇到分歧会先询问对方的顾虑。'),again=mergeWorldPeople([merged],next)[0];
 assert.equal(again.presentationSource.personality,next.foundation.people[0].disposition);
 assert.deepEqual(presentationRequests([again]),[{personId:qid,identityRelations:p.presentationSource.relations}]);
 const publicPerson=person({presentationSource:{personality:'personality: 当前非空原资料',relations:''}});assert.equal(mergeWorldPeople([publicPerson],s)[0].presentationSource.personality,publicPerson.presentationSource.personality);
 const manual=person({manualProfile:{personality:''}});assert.equal(mergeWorldPeople([manual],s)[0].presentationSource.personality,'');
 const unreviewed={...s,foundation:{...s.foundation,people:[seed('旧插件自由文',[publicSource])]}};assert.equal(mergeWorldPeople([p],unreviewed)[0].presentationSource.personality,'');
 const local=mergeWorldPeople([],s)[0];assert.equal(mergeWorldPeople([local],next)[0].presentationSource.personality,next.foundation.people[0].disposition);
});
test('avatars use current personality only and keep the old seeded face when no class matches',()=>{
 const coldText='冷漠寡言，独来独往。';
 const saved=state(coldText,{developmentPresentation:[{personId:qid,temperament:{basisKey:presentationBasis(coldText),value:'bright'}}]});
 const portrait=source=>projectWorldState('scope',mergeWorldPeople([source],saved).map(projectSourcePerson),saved).people[0].temperament;
 const cold=portrait(person());
 const sunny=portrait(person({presentationSource:{personality:'personality: 并不冷漠。\nexpression: 像个小太阳，说话爽朗。\ndislikes: 过于热情的人',relations:'某位朋友很冷漠'}}));
 const manual=person({manualProfile:{personality:''},description:'职业：温柔的小太阳',presentationSource:{personality:'likes: 小太阳一类的故事\n也爱读冷漠的人物\ndislikes: 热情的人\nprinciples: 不和冷淡的人做朋友',relations:'伙伴很开朗'}});
 assert.deepEqual([cold,sunny,portrait(manual)],['reserved','bright','unknown']);
 assert.equal(portrait(person({presentationSource:{personality:'并不冷漠。',relations:''}})),'unknown');
 for(let n=0;n<18;n++){
  const reserved=smilePreset('portrait-'+n,cold), bright=smilePreset('portrait-'+n,sunny);
  assert.ok(['#9aa9b5','#a7a0b5'].includes(reserved.foreground[0])&&['neutral','thoughtful'].includes(reserved.expression));
  assert.ok(['#b4a78c','#b6ab78'].includes(bright.foreground[0])&&['grin','smile'].includes(bright.expression));
 }
 assert.deepEqual(smilePreset('qa-stable-avatar',portrait(manual)),{
  id:'qa-stable-avatar:features',size:160,expression:'thoughtful',foreground:['#b99a92','#ecd4c6'],background:'#f6f3eb',interpolate:false,
 });
 assert.equal(saved.developmentPresentation[0].temperament.value,'bright');
});
test('hearing uses already supplied effective life evidence; unknown IDs, invalidated facts and same-answer event keys stay local',()=>{
 const event={id:'past',activityId:null,title:'帮忙修柜',description:'他先反复检查合页再动手，给同伴解释了理由。',participantIds:[qid],sources:[{kind:'simulation',id:'old',label:'已保存生活'}],storyTime:null};
 const s=state('做事细致。',{events:[event]}),input={people:[person()],state:s,story,initial:false};
 const stage={key:'now',sourceSeqs:[2],onstagePersonIds:[],offstagePersonIds:[]};
 const update={id:qid,disposition:'做事细致，协作时愿意解释理由。',basisEventIds:['past'],stageKey:'now',assertedPersonIds:[qid],assertsUser:false};
 const result=applyDevelopment(input,{foundation:{people:[update]},stages:[stage],activities:[],events:[],knowledge:[],quietReason:'没有其他变化'});assert.equal(result.state.foundation.people[0].disposition,update.disposition);
 for(const row of [{...update,id:'not-supplied'},{...update,basisEventIds:['unknown']},{...update,basisEventIds:['new-life']},{...update,basisEventIds:['corrected']}]){
  const current={...input,state:{...s,events:[event,{...event,id:'corrected',correction:{byEventId:'past',reason:'已推翻'}}]}};
  const kept=applyDevelopment(current,{foundation:{people:[row]},stages:[stage],activities:[{key:'a',title:'整理工具',description:'把已用工具归位。',status:'active',participantIds:[qid],stageKey:'now',assertedPersonIds:[qid],assertsUser:false}],events:[],knowledge:[],quietReason:'整理工具'});
  assert.equal(kept.state.foundation.people[0].disposition,'做事细致。');assert.equal(kept.state.activities.length,1);
 }
});
function productionFixture({fill=true,initialState=state('',{events:[{id:'past',activityId:null,title:'帮忙修柜',description:'他仔细核对合页，并向同伴解释检查的理由。',participantIds:[qid],sources:[{kind:'simulation',id:'old',label:'已存生活'}],storyTime:null}]}),live=[person()]}={}){
 let envelope=initialState&&{revision:1,data:initialState},through=2,books=0,sharedReads=0,saves=0,taste=0;
 const calls=[];const repo=createWorldRepository({async get(){return structuredClone(envelope);},async put(_c,_id,data,revision){assert.equal(revision,envelope?.revision??0);data=structuredClone(data);if(fill&&saves===0)data.foundation.people[0].disposition+='（保存ACK）';envelope={revision:revision+1,data};saves++;return structuredClone(envelope);}});
 const create=()=>{const app=createPeopleWorld({directory:{readPeople:()=>({status:'ready',scopeId:'scope',people:live,message:''})},repository:repo,
  history:{readStoryHistory({fromSeq}){return{...story,throughSeq:through,turns:fromSeq>through?[]:[{seq:through,isUser:false,text:'店里照常营业。'}],status:fromSeq>through?'empty':'ready',latestAiSeq:through+1};}},story:{readStoryInput(){throw Error('legacy');}},
  worldSettings:{async read(){books++;throw Error('personality gap must not reread books');}},
  materials:{async readForQuestion(){throw Error('shared batch required');},async readForQuestions(requests){sharedReads++;return requests.map(()=>({status:'ready',message:'',routerText:'',materials:[{personId:qid,profileText:'- personality: 做事谨慎，开口前先确认。',stateText:'',memoryText:'',refs:[],sources:[publicSource]}],coverage:{partial:false}}));}},
  config:{getProfile:async()=>({url:'https://offline.invalid',key:'fake',model:'fixture'})},
  createModelRequester:profiles=>createModelRequester(profiles,{async generate(_profile,messages,_max,_signal,onStarted){onStarted?.();const input=JSON.parse(messages[1].content),isTaste=Object.hasOwn(input,'presentationRequests'),actor=(input.people??input.background.people)[0];calls.push({input,system:messages[0].content,isTaste});
   if(isTaste){taste++;return JSON.stringify({atmosphereUpdates:[],quietReason:'店内照常经营',...(fill&&taste===1?{foundation:{people:[{id:actor.id,disposition:'做事谨慎，开口前先确认。',sourceIds:[qid]}]}}:{})});}
   const s={key:'now',sourceSeqs:[through],onstagePersonIds:[],offstagePersonIds:[]};return JSON.stringify({stages:[s],activities:[],events:[],knowledge:[],quietReason:'当前没有其他变化',...(fill&&taste===1?{foundation:{people:[{id:actor.id,disposition:'做事谨慎克制，协作时愿意解释核对的理由。',basisEventIds:[input.events[0].id],stageKey:'now',assertedPersonIds:[],assertsUser:false}]}}:{})});
  }}),advancer:{advance(){throw Error('legacy');}}});app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>100});return app;};
 return{app:create(),create,calls,setPeople(people){live=people;},next(){through++;},get data(){return envelope?.data;},get books(){return books;},get sharedReads(){return sharedReads;},get saves(){return saves;}};
}
test('the first unknown avatar survives personality enrichment and a fresh controller through the existing saves',async()=>{
 const f=productionFixture();await f.app.refresh();
 assert.equal(f.app.state.value.world.people[0].temperament,'unknown');
 assert.equal(f.saves,0);
 await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,2);assert.equal(f.saves,2);
 assert.deepEqual(f.calls[0].input.foundationPersonalityPendingPersonIds,['P1']);assert.match(f.calls[1].input.foundation.people[0].disposition,/保存ACK/);assert.equal(f.data.foundation.people[0].disposition,'做事谨慎克制，协作时愿意解释核对的理由。');
 assert.equal(f.app.state.value.world.people[0].temperament,'unknown');
 assert.equal(f.data.avatarTemperaments?.[qid],'unknown');
 f.next();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,4);assert.equal(f.saves,3);assert.equal(f.sharedReads,2);assert.equal(f.books,0);
 assert.deepEqual(f.calls[2].input.presentationRequests,[{personId:'P1',identityRelations:'identityRelations: 与乙共事'}]);assert.deepEqual(f.calls[2].input.foundationPersonalityPendingPersonIds,[]);
 const reopened=f.create();await reopened.refresh();assert.equal(reopened.state.value.world.people[0].temperament,'unknown');assert.equal(f.saves,3);
 for(const call of f.calls)assert.doesNotMatch(call.system+JSON.stringify(call.input),/avatarTemperaments|temperament/);
 assert.match(f.calls[0].system,/当前情绪.*长期性格/);assert.match(f.calls[1].system,/已存.*经历/);
 assert.match(f.calls[1].system,/同答foundation\.groups\/relations可引用已接纳event key/);assert.doesNotMatch(f.calls[1].system,/同答foundation可引用/);
});
test('refreshes lock the first current profile on the canonical person while valid relationship hints and normal writes still work',async()=>{
 const stable='old-local-id',companion={id:'companion',displayName:'乙',aliases:[],description:'已知同事',source:book};
 const relationship='identityRelations: 与乙共事';
 const local=person({presentationSource:{personality:'性格冷淡寡言。',relations:relationship}});
 const initialState=state('温和');
 initialState.foundation.people=[{...seed('温和'),id:stable,qqjPersonId:qid}];
 const edge={fromPersonId:stable,toPersonId:companion.id,fromRole:'同事',toRole:'同事',directed:false};
 const hint={personId:stable,temperament:{basisKey:presentationBasis(local.presentationSource.personality),value:'bright'},profileRelations:{basisKey:presentationBasis(relationship),items:[edge]}};
 initialState.developmentPresentation=[hint];
 const f=productionFixture({fill:false,initialState,live:[local,companion]});
 const check=()=>{const world=f.app.state.value.world;assert.equal(world.people.find(p=>p.id===stable)?.temperament,'reserved');assert.ok(!world.people.some(p=>p.id===qid));assert.deepEqual(world.profileRelations,[edge]);};
 await f.app.refresh();check();
 f.setPeople([{...local,presentationSource:{personality:'开朗的小太阳。',relations:relationship}},companion]);
 await f.app.refresh();await f.app.refresh();check();
 assert.equal(f.saves,0);assert.equal(f.calls.length,0);assert.equal(f.data.avatarTemperaments,undefined);
 await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');check();
 assert.equal(f.saves,2);assert.equal(f.calls.length,2);
 assert.deepEqual(f.data.avatarTemperaments,{[stable]:'reserved',[companion.id]:'unknown'});
 assert.deepEqual(f.data.developmentPresentation,[hint]);
 assert.deepEqual(f.calls[0].input.presentationRequests,[]);
});
test('a chat without a saved world locks the ID-seeded fallback in memory through repeat reads',async()=>{
 const f=productionFixture({fill:false,initialState:null});
 await f.app.refresh();const first=f.app.state.value.world.people[0];
 assert.equal(first.temperament,'unknown');
 f.setPeople([person({presentationSource:{personality:'温柔耐心。',relations:''}})]);
 await f.app.refresh();const same=f.app.state.value.world.people[0];
 assert.equal(same.temperament,first.temperament);
 assert.deepEqual(smilePreset(same.id,same.temperament),smilePreset(first.id,first.temperament));
 assert.equal(f.saves,0);assert.equal(f.calls.length,0);assert.equal(f.data,undefined);
});
test('unknown personality may stay empty through normal two-call rounds without blocking life or rescanning books',async()=>{
 const f=productionFixture({fill:false});await f.app.refresh();await f.app.startDevelopment();f.next();await f.app.startDevelopment();assert.equal(f.app.developmentView.value.error,'');assert.equal(f.calls.length,4);assert.equal(f.sharedReads,2);assert.equal(f.books,0);assert.equal(f.data.foundation.people[0].disposition,'');
 for(const call of f.calls)assert.deepEqual(call.input.foundationPersonalityPendingPersonIds,['P1']);
});
