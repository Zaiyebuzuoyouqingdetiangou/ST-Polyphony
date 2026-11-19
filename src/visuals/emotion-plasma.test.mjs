import '../../scripts/source-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
const {plasmaPreset}=await import('./presets.ts');
const {generateAvatar}=await import('../vendor/avatar-generator/src/themes/plasma/index.ts');
const {tasteCircles}=await import('../domain/social-circles.ts');
const emotionModule=await import('../domain/emotion.ts');const {EMOTION_KEYS}=emotionModule;
function pixels(values){let pixels;const canvas={getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(image){pixels=image.data;}}}};generateAvatar({...plasmaPreset('same-circle',undefined,values),size:48,canvas});return pixels;}
test('real Plasma pixels consume every emotion component, stay deterministic, and change with absolute strength',()=>{
 const blank=pixels({dissatisfaction:0});for(const key of EMOTION_KEYS){const high=pixels({[key]:85});assert.notDeepEqual(high,blank,key);assert.notDeepEqual(high,pixels({[key]:20}),key);assert.deepEqual(high,pixels({[key]:85}),key);const mixed=Object.fromEntries(EMOTION_KEYS.map(k=>[k,30]));assert.notDeepEqual(pixels({...mixed,[key]:80}),pixels(mixed),'mixed '+key);}
 const red=pixels({dissatisfaction:90}),blue=pixels({sadness:90});const mean=data=>[0,1,2].map(c=>data.reduce((n,x,i)=>n+(i%4===c?x:0),0)/(data.length/4));assert.ok(mean(red)[0]>mean(red)[2]);assert.ok(mean(blue)[2]>mean(blue)[0]);
});
test('renderer gets three synthesized colors; waveform weights stay constant and legacy visuals remain readable',()=>{
 const a=plasmaPreset('c',undefined,{dissatisfaction:80}),b=plasmaPreset('c',undefined,{sadness:80});assert.equal(a.foreground.length,3);assert.notDeepEqual(a.foreground,b.foreground);for(const k of ['id','scale1','scale2','scale3','weight1','weight2','weight3'])assert.equal(a[k],b[k],k);assert.deepEqual(plasmaPreset('c',{temperature:'warm',rhythm:'calm'}).foreground,['#986852','#bd9e81','#e2d5a6']);
});
test('approved mixed palette keeps distinct warm and cool anchors while faint and invalid values retain their fallbacks',()=>{
 const foreground=values=>plasmaPreset('c',undefined,values).foreground;
 const values={affinity:38,dissatisfaction:24,worry:15,sadness:30,anticipation:12};
 assert.deepEqual(foreground(values).map(rgb=>rgb.map(Math.round)),[[218,174,171],[155,164,209],[225,207,186]]);
 assert.notDeepEqual(foreground({...values,worry:0}),foreground(values));
 assert.notDeepEqual(foreground({sadness:.01}),foreground({sadness:0}));
 assert.deepEqual(foreground({sadness:0,worry:-5,fear:'invalid'}),foreground({sadness:0}));
 assert.deepEqual(foreground({}),foreground({fear:Infinity}));
 assert.deepEqual(foreground({sadness:Number.MIN_VALUE}),foreground({sadness:0}));
});
test('multiple winds use component maxima and duplicate winds cannot amplify or neutralize a circle',()=>{
 const people=[{id:'p',name:'甲'},{id:'q',name:'乙'}],foundation={people:[],relations:[],groups:[{id:'g',name:'组',description:'合作',members:people.map(p=>({personId:p.id,fromWindowId:'b'})),sources:[],establishedWindowId:'b',currentStateWindowId:'b'}]};
 const row=(id,values)=>({id,circleRef:'foundation:group:g',title:'组',description:'公开气氛',personIds:['p','q'],basisEventIds:[],sources:[],emotion:{values,severity:'ordinary',ongoing:false,stimulusRefs:[],throughSeq:1}});
 const w={people,foundation,events:[],atmospheres:[row('a',{affinity:70,dissatisfaction:30}),row('b',{sadness:25,dissatisfaction:20})]};const first=tasteCircles(w)[0];assert.deepEqual(first.emotionValues,{affinity:70,dissatisfaction:30,sadness:25});w.atmospheres.push(row('duplicate',{affinity:70,dissatisfaction:30}));assert.deepEqual(tasteCircles(w)[0].emotionValues,first.emotionValues);assert.doesNotMatch(first.description,/\d/);
});
test('relaxation and excitement from separate winds also meet at the relaxed lively middle',()=>{
 const {combineEmotions}=emotionModule;assert.deepEqual(combineEmotions([{relaxation:90,affinity:70},{excitement:90,aversion:35}]),{relaxation:55,affinity:70,excitement:55,aversion:35});
});
test('production taste projection retains each saved circle description with numeric ongoing rows and multiple winds',()=>{
 const people=['p','q','r','s'].map(id=>({id,name:id}));
 const group=id=>({id,name:'圈'+id,description:'原有群说明'+id,members:people.slice(0,2).map(p=>({personId:p.id,fromWindowId:'b'})),sources:[],establishedWindowId:'b',currentStateWindowId:'b'});
 const descriptions=['两人说话比从前随意，店里的忙碌也没有打断熟悉的玩笑。','交接时仍会留意对方的分寸，合作尚算平稳。','这次把误会当面说开后，话题终于转回了手头的小事。','各自有事要忙，见面时的招呼仍旧亲切。'];
 const row=(id,circle,description,values)=>({id,circleRef:'foundation:group:'+circle,title:'旧标题',description,personIds:['p','q'],basisEventIds:[],sources:[],...(values?{emotion:{values,publicBasis:'只供内部核对的依据'+id,severity:'ordinary',ongoing:true,throughSeq:2,stimulusRefs:[],trend:'easing'}}:{})});
 const world={people,foundation:{people:[],relations:[],groups:['a','b','c','d','legacy'].map(group)},events:[],atmospheres:descriptions.map((description,i)=>row('wind'+i,['a','b','c','d'][i],description,{affinity:60,relaxation:35}))};
 world.atmospheres.push(row('second','a','谈到下周的安排时，他们仍有几处意见不同。',{dissatisfaction:30}),row('duplicate','a',descriptions[0],{affinity:75}),row('old','legacy','旧档的模型说明照常保留。'));
 const before=structuredClone(world),circles=tasteCircles(world);
 assert.deepEqual(circles.map(circle=>circle.description),[descriptions[0]+'\n\n谈到下周的安排时，他们仍有几处意见不同。',...descriptions.slice(1),'旧档的模型说明照常保留。']);
 assert.deepEqual(circles[0].emotionValues,{affinity:75,relaxation:35,dissatisfaction:30});assert.deepEqual(circles[0].atmosphereIds,['wind0','second','duplicate']);assert.equal(circles[4].emotionValues,undefined);
 assert.doesNotMatch(circles.map(circle=>circle.description).join('\n'),/内部核对|公开缘由是|事情尚未落定|日常相处继续|亲近明显/);assert.deepEqual(world,before);
});
test('internal emotion summary does not invent an unresolved affair or concern from ongoing alone',()=>{
 const value={values:{affinity:65,satisfaction:45},publicBasis:'熟络日常',severity:'ordinary',ongoing:true,throughSeq:2,stimulusRefs:[]};
 assert.equal(emotionModule.emotionSummary(value),emotionModule.emotionSummary({...value,ongoing:false}));
 assert.doesNotMatch(emotionModule.emotionGuidance(value),/事情仍未落定，关切可保留|事情尚未落定，关切仍在/);
});
