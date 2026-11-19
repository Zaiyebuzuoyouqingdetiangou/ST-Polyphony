import '../../scripts/source-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {applyAtmosphere,atmosphereContext}=await import('./atmosphere.ts');
const {developmentContext,prepareDevelopment}=await import('./development.ts');
const {applyFoundation}=await import('./foundation.ts');
const {createWorldRepository}=await import('../storage/world-repository.ts');
const source={kind:'world-book',id:'book',label:'公开设定'};
const people=['p','q'].map(id=>({id,displayName:id,description:'人物资料',aliases:[],source}));
const foundation={throughSeq:1,windowId:'base',people:people.map(p=>({id:p.id,name:p.id,aliases:[],identity:'店主',motivations:'',disposition:'',interests:'',life:'',sources:[source],establishedWindowId:'base',currentStateWindowId:'base'})),groups:[{id:'g',name:'街坊圈',description:'共同经营',members:people.map(p=>({personId:p.id,fromWindowId:'base'})),sources:[source],establishedWindowId:'base',currentStateWindowId:'base'}],relations:[]};
const input=(state={},clock='2027-03-20T08:00',seq=2)=>({people,state:{schemaVersion:1,scopeId:'s',processedThroughSeq:1,storyTime:{text:'2027-03-20T08:00'},activities:[],events:[],knowledge:[],foundation:structuredClone(foundation),...state},story:{status:'ready',throughSeq:seq,turns:[{seq,isUser:false,text:'两人公开谈起订单的分歧，互相解释后照常经营。'}],source:{kind:'chat',id:'s'}},initial:false,prepared:{materials:[],currentClock:clock,creativeFrame:{key:'frame',version:1,recipeId:'steady',intensity:'低烈度',directions:{A:['不得复制听的动作配方']}},narrativeRoles:{storyControlled:[],autonomous:[],policy:''}}});
const wind=(emotion,extra={})=>({key:'wind',circleRef:'foundation:group:g',title:'街坊圈',personIds:['p','q'],background:{description:'公开互助，也对做法有意见。',basisMaterialRefs:['foundation:group:g'],emotion},...extra});
const run=(i,rows=[])=>applyAtmosphere(i,{atmosphereUpdates:rows});
const values=r=>r.state.developmentAtmospheres[0]?.emotion?.values;
const assessment=(values,change='none',ongoing=false)=>({values,change,ongoing,publicBasis:'公开的分歧与互助',visibility:'public'});
test('independent values accept Chinese aliases and numeric strings while a bad component retains useful text',()=>{
 const r=run(input(),[wind(assessment({'亲近':'70','反感':30,'不满':'坏值','期待':20}))]);
 assert.deepEqual(values(r),{affinity:70,anticipation:20,aversion:30});assert.match(r.state.developmentAtmospheres[0].description,/公开互助/);
 const legacy=run(input(),[wind({values:{dissatisfaction:null}})]);assert.equal(legacy.state.developmentAtmospheres.length,1);assert.equal(legacy.state.developmentAtmospheres[0].emotion,undefined);
});
test('other feelings fading never increases dissatisfaction; unknown time holds and relaxation/excitement balance locally',()=>{
 const a=run(input(),[wind(assessment({affinity:80,dissatisfaction:30,relaxation:90,excitement:90}))]);
 assert.equal(values(a).dissatisfaction,30);assert.equal(values(a).affinity,80);assert.equal(values(a).relaxation,55);assert.equal(values(a).excitement,55);
 const b=run(input(a.state,null,3),[wind(assessment({affinity:5}),{id:a.state.developmentAtmospheres[0].id})]);
 assert.equal(values(b).dissatisfaction,30);const c=run(input(b.state,null,4));assert.deepEqual(values(c),values(b));
});
test('ordinary fresh friction rises slightly, repeated source does not rise, many little frictions never become extreme',()=>{
 let r=run(input(),[wind(assessment({dissatisfaction:100},'minor'))]);assert.ok(values(r).dissatisfaction<=45);
 for(let seq=3;seq<25;seq++){const i=input(r.state,null,seq),id=r.state.developmentAtmospheres[0].id;const next=run(i,[wind(assessment({dissatisfaction:100},'minor'),{id,change:{description:'新的公开小分歧',sourceSeqs:[seq],assertedPersonIds:[],assertsUser:false}})]);assert.ok(values(next).dissatisfaction<=45);assert.ok(values(next).dissatisfaction-values(r).dissatisfaction<=8);assert.deepEqual(values(run(input(next.state,null,seq),[wind(assessment({dissatisfaction:100},'minor'),{id})])),values(next));r=next;}
});
test('credible elapsed story time decays once, retains ongoing worry floor and permits previously high values to fall',()=>{
 const i=input();i.story.turns[0].text='主楼明确写道：仓库事故造成了严重伤亡，原本共同经营的店铺也在火灾中被毁，两人当面得知救援结果，仓库仍封闭，重建日期尚未确定。';const quote=i.story.turns[0].text;
 let r=run(i,[wind(assessment({worry:90,dissatisfaction:95},'major',true),{change:{description:'正式公开事实',sourceSeqs:[2],assertedPersonIds:[],assertsUser:false,emotion:{...assessment({worry:90,dissatisfaction:95},'major',true),majorEvidence:{sourceSeq:2,quote},ongoingEvidence:{sourceSeq:2,quote}}}})]);
 assert.equal(values(r).dissatisfaction,95);
 const later=input(r.state,'2027-03-30T08:00',3),b=run(later);assert.ok(values(b).dissatisfaction<5);assert.equal(values(b).worry,25);assert.deepEqual(run(input(b.state,later.prepared.currentClock,3)).state.developmentAtmospheres,b.state.developmentAtmospheres);
 assert.deepEqual(run(input(b.state,'2027-03-19T08:00',4)).state.developmentAtmospheres,b.state.developmentAtmospheres);
});
test('a major label alone, rejected change and private assessment cannot bypass ordinary bounds or scene ownership',()=>{
 const i=input();const r=run(i,[wind(assessment({dissatisfaction:100},'major'))]);assert.ok(values(r).dissatisfaction<=45);
 const privateRow=wind({...assessment({fear:100}),visibility:'private'});assert.equal(run(i,[privateRow]).state.developmentAtmospheres[0]?.emotion,undefined);
 const bad=run(i,[wind(undefined,{change:{description:'未公开的个人害怕',sourceSeqs:[2],assertedPersonIds:['p'],assertsUser:false,stageKey:'now',emotion:assessment({fear:100},'major')}})]);assert.equal(bad.state.developmentAtmospheres[0].emotion,undefined);
});
test('exact circle supplies its title; static bad membership keeps reliable group and other good members',()=>{
 const row=wind(assessment({satisfaction:30}));delete row.title;const r=run(input(),[row]);assert.equal(r.state.developmentAtmospheres[0]?.title,'街坊圈');
 const i=input(),point={id:'s',text:'当前',sourceSeqs:[2]};const f=applyFoundation({...i,worldSettings:{}},{groups:[{id:'g',description:'可靠群说明',members:[{personId:'p'},{personId:'missing'}],sourceIds:['book']}]},{id:'w',kind:'current',from:point,to:point,throughSeq:2},{static:true});assert.equal(f.foundation.groups[0].description,'可靠群说明');assert.ok(f.rejections.some(r=>r.kind==='group-member'));assert.equal(f.foundation.groups[0].members.length,2);
});
test('taste has one people payload, bound current moods, separate repair list and no hearing action recipe',()=>{
 const i=input({developmentAtmospheres:[{id:'unbound',title:'旧现场',description:'旧现场',personIds:['p'],sources:[],basisEventIds:[]}]});const c=atmosphereContext(i,i.prepared);
 assert.equal(c.people,undefined);assert.deepEqual(c.background.atmospheres,[]);assert.equal(c.atmosphereRepairs[0].id,'unbound');assert.equal(c.creativeFrame.directions,undefined);
});
test('serialized save ACK and reload keep optional state, hearing consumes effective strengths and cooling guidance',async()=>{
 const r=run(input(),[wind(assessment({worry:45,dissatisfaction:30},'none',true))]);let envelope;
 const repo=createWorldRepository({async put(_c,_i,data){envelope=JSON.parse(JSON.stringify({data,revision:9}));envelope.data.developmentAtmospheres[0].emotion.values.worry=22;return JSON.parse(JSON.stringify(envelope));},async get(){return JSON.parse(JSON.stringify(envelope));}});
 const ack=await repo.save('s',r.state,8);const loaded=await repo.load('s');assert.equal(loaded.revision,9);assert.deepEqual(ack,loaded);
 const c=developmentContext(input(loaded.state),input().prepared);assert.equal(c.atmospheres[0].emotion.values.worry,22);assert.match(c.atmospheres[0].emotionGuidance,/缓和|降温/);assert.equal(c.atmospheres[0].visual,undefined);
});
test('full preparation retains ready results alongside a failed topic; ordinary preparation still surfaces waiting and errors',async()=>{
 const i=input();i.people=i.people.map((p,n)=>({...p,identityDescription:'店主的日常职责',id:'qqj:'+JSON.stringify(['s',String(n)]),qqjPersonId:'qqj:'+JSON.stringify(['s',String(n)])}));
 const empty={status:'empty',materials:[],routerText:'',coverage:{partial:false}};let reads=0;
 const deps={materials:{async readForQuestions(reqs){reads++;return reqs.map((_,n)=>n?{...empty,status:'error',message:'附加资料失败'}:empty);}}};
 const p=await prepareDevelopment({...i,initial:true,dependencies:deps});assert.equal(reads,1);assert.ok(p.materials.length>0);assert.equal(p.materials[0].coverage.partial,true);
 await assert.rejects(prepareDevelopment({...i,dependencies:{materials:{async readForQuestions(reqs){return reqs.map(()=>({...empty,status:'waiting'}));}}}}),/尚未准备|稍后/);
 await assert.rejects(prepareDevelopment({...i,dependencies:{materials:{async readForQuestions(reqs){return reqs.map(()=>({...empty,status:'error',message:'附加资料失败'}));}}}}),/附加资料失败/);
});
test('private one-person knowledge and free material memories never become shared taste input or numeric evidence; hearing retains them',()=>{
 const secret={id:'secret',activityId:null,title:'私下想法',description:'只在心里对另一人不满',participantIds:['p'],sources:[{kind:'simulation',id:'private',label:'个人经历'}],storyTime:null};
 const i=input({events:[secret],knowledge:[{personId:'p',eventId:'secret',reason:'只有本人知道',sources:[]}]});i.prepared.materials=[{status:'ready',routerText:'个人秘密路由',coverage:{partial:false},materials:[{personId:'p',profileText:'兴趣：棋类',stateText:'未说出口的不满',memoryText:'秘密计划',refs:[{memoryId:'only-p',floorIds:[]}],sources:[{kind:'plugin',id:'qqj-context:["s","only-p"]',label:'个人记忆'}]}]}];
 const taste=atmosphereContext(i,i.prepared),hearing=developmentContext(i,i.prepared),text=JSON.stringify(taste);
 assert.doesNotMatch(text,/未说出口的不满|秘密计划|个人秘密路由|只在心里|只有本人知道|only-p/);assert.match(JSON.stringify(hearing),/未说出口的不满/);assert.equal(taste.background.knowledge,undefined);assert.equal(taste.background.personContexts,undefined);
 const r=run(i,[wind(undefined,{background:{description:'长期互助',basisEventIds:['secret'],emotion:assessment({dissatisfaction:100})}})]);assert.equal(r.state.developmentAtmospheres[0]?.emotion,undefined);
});
test('unknown or stationary time with no new public stimulus preserves every value and ongoing basis',()=>{
 const a=run(input(),[wind(assessment({affinity:75,satisfaction:60,dissatisfaction:40,worry:35},'none',true))]);
 const id=a.state.developmentAtmospheres[0].id;
 for(const clock of [null,'2027-03-20T08:00','2027-03-19T08:00'])for(const target of [0,100]){const r=run(input(a.state,clock,3),[wind({...assessment({affinity:target,satisfaction:target,dissatisfaction:target,worry:target},'none',false),publicBasis:'模型自行改口'},{id})]);assert.deepEqual(r.state.developmentAtmospheres[0].emotion,a.state.developmentAtmospheres[0].emotion);}
});
test('old A evidence cannot become new after B, and a clockless old state anchors before decaying',()=>{
 let a=run(input(),[wind(assessment({dissatisfaction:20}))]);const id=a.state.developmentAtmospheres[0].id;
 const changed=(seq,ref)=>wind(undefined,{id,change:{description:'公开交流',sourceSeqs:[ref],assertedPersonIds:[],assertsUser:false,emotion:assessment({dissatisfaction:100},'minor')}});
 let b=run(input(a.state,null,3),[changed(3,3)]);assert.equal(values(b).dissatisfaction,28);
 const i=input(b.state,null,4);i.story.turns.push({...i.story.turns[0],seq:2});const c=run(i,[changed(4,2)]);assert.equal(values(c).dissatisfaction,28);
 delete b.state.developmentAtmospheres[0].emotion.clock;const anchored=run(input(b.state,'2027-03-20T10:00',5));assert.equal(values(anchored).dissatisfaction,28);assert.equal(anchored.state.developmentAtmospheres[0].emotion.clock,'2027-03-20T10:00');const later=run(input(anchored.state,'2027-03-20T12:00',6));assert.equal(values(later).dissatisfaction,14);
});
test('explicit private text or an event outside the stated audience drops only that segment, not its public background',()=>{
 for(const secret of [{description:'不可公开的心事',sourceSeqs:[2],visibility:'private'},{description:'不可公开的心事',sourceSeqs:[2],emotion:{...assessment({fear:95}),visibility:'private'}},{description:'不可公开的心事',basisEventIds:['secret']}]){
  const i=input({events:[{id:'secret',title:'秘密',description:'个人心思',activityId:null,participantIds:['p'],sources:[],storyTime:null}],knowledge:[{personId:'p',eventId:'secret',reason:'私下得知',sources:[]}]});
  const r=run(i,[wind(assessment({affinity:40}),{change:{assertedPersonIds:[],assertsUser:false,...secret}})]);assert.equal(r.state.developmentAtmospheres.length,1);assert.doesNotMatch(r.state.developmentAtmospheres[0].description,/不可公开/);assert.match(r.state.developmentAtmospheres[0].description,/公开互助/);assert.doesNotMatch(JSON.stringify(developmentContext(input(r.state),i.prepared).atmospheres),/不可公开/);
 }
});
test('a QQJ reference is not automatically private: exact supplied public references still support a public segment',()=>{
 const i=input(),id='qqj-context:["s","public-order"]';i.prepared.materials=[{status:'ready',materials:[{personId:'p',profileText:'',stateText:'',memoryText:'',refs:[{memoryId:'public-order',floorIds:[]}],sources:[{kind:'plugin',id,label:'共同公开经历'}]}]}];
 const r=run(i,[wind(undefined,{change:{description:'已公开的订单交流',basisMaterialRefs:['public-order'],assertedPersonIds:[],assertsUser:false,emotion:assessment({satisfaction:30})}})]);assert.match(r.state.developmentAtmospheres[0].description,/已公开的订单交流/);assert.equal(values(r).satisfaction,30);
});
test('confirmed synonyms normalize through real admission with canonical precedence and no guessing split feelings',()=>{
 const i=input(),r=run(i,[wind(assessment({'愤怒':'24','喜爱':'38','好奇':28,'害怕':16,'愉悦':90,'失落':80}))]);assert.deepEqual(values(r),{affinity:38,anticipation:28,fear:16,dissatisfaction:24});
 const english=run(i,[wind(assessment({anger:22,love:33,curiosity:26}))]);assert.deepEqual(values(english),{affinity:33,anticipation:26,dissatisfaction:22});
 const precedence=run(i,[wind(assessment({dissatisfaction:12,'不满':30,anger:80,'愤怒':90,affinity:20,love:100,'喜爱':99}))]);assert.deepEqual(values(precedence),{affinity:20,dissatisfaction:12});
});
test('a reused main-story major quotation cannot re-intensify the already eased state',()=>{
 const i=input();i.story.turns[0].text='主剧情明确：这次严重事故造成了无法挽回的伤亡，救援负责人当面对两人公布了结果。';const quote=i.story.turns[0].text;
 const changed=(id)=>wind(undefined,{...(id?{id}:{}),change:{description:'共同面对事故结果',sourceSeqs:[2],assertedPersonIds:[],assertsUser:false,emotion:{...assessment({sadness:95},'major'),majorEvidence:{sourceSeq:2,quote}}}});
 const a=run(i,[changed()]),b=run(input(a.state,'2027-03-22T08:00',3));const before=values(b).sadness;
 const next=input(b.state,'2027-03-22T08:00',4);next.story.turns.push({seq:2,isUser:false,text:quote});const c=run(next,[changed(b.state.developmentAtmospheres[0].id)]);assert.equal(values(c).sadness,before);
});
test('a newly sourced factual correction can lower prior strength and resolve ongoing worry without inventing a major rise',()=>{
 const a=run(input(),[wind(assessment({worry:40,dissatisfaction:35},'none',true))]),id=a.state.developmentAtmospheres[0].id;
 const i=input(a.state,null,3);i.story.turns[0].text='两人当面确认：先前的消息有误，订单已经正常送达。';const r=run(i,[wind(undefined,{id,change:{description:'已经当面更正原消息',sourceSeqs:[3],assertedPersonIds:[],assertsUser:false,emotion:assessment({worry:5,dissatisfaction:8},'correction',false)}})]);assert.equal(values(r).worry,5);assert.equal(values(r).dissatisfaction,8);assert.equal(r.state.developmentAtmospheres[0].emotion.ongoing,false);
});
test('next taste receives the same story-time-decayed strengths in individual and circle projections',()=>{
 const a=run(input(),[wind(assessment({worry:40,affinity:60},'none',true))]),i=input(a.state,'2027-03-20T10:00',3),context=atmosphereContext(i,i.prepared);
 assert.equal(context.background.atmospheres[0].emotion.values.worry,20);assert.equal(context.background.circleEmotions[0].values.worry,20);assert.equal(context.background.atmospheres[0].emotion.values.affinity,context.background.circleEmotions[0].values.affinity);assert.equal(a.state.developmentAtmospheres[0].emotion.values.worry,40);
});
test('a short nonempty verbatim main-story sentence can support the same-answer major assessment',()=>{
 const i=input();i.story.turns[0].text='他死了。';const r=run(i,[wind(undefined,{change:{description:'当面得知死亡事实',sourceSeqs:[2],assertedPersonIds:[],assertsUser:false,emotion:{...assessment({sadness:95},'major'),majorEvidence:{sourceSeq:2,quote:'他死了。'}}}})]);assert.equal(values(r).sadness,95);
});
