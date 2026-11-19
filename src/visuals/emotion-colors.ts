import {SeededRandom} from '../vendor/avatar-generator/src/core/seededRandom';
import {parseColor,interpolateColors,rgbToHsl,hslToRgb,pickColors,type Color,type ColorValue} from '../vendor/avatar-generator/src/core/colors';
import {EMOTION_KEYS,normalizeEmotionValues,type EmotionKey} from '../domain/emotion';

/** Unmodified color data from avatar-generator examples/vanilla/main.ts:14–49 (React uses the same data).
 * https://github.com/reindernijhoff/avatar-generator/blob/main/examples/vanilla/main.ts
 * Audited file blob: f0a47a9e2a44fca3f44c71c1ae621052372972e5.
 * MIT; the vendored project license remains in src/vendor/avatar-generator/LICENSE.
 */
export const UPSTREAM_COLOR_PRESETS={
 random:{background:'#f0f0f0'},
 fixed:{background:'#f0f0f0',foreground:'#fe4365',interpolate:false},
 palette:{background:'#f0f0f0',foreground:['#fe4365','#fc9d9a','#f9cdad','#c8c8a9','#83af9b'],interpolate:false},
 gradient:{background:'#f0f0f0',foreground:['#69d2e7','#a7dbd8','#e0e4cc','#f38630','#fa6900'],interpolate:true},
 variations:{foreground:'#3366ff',hueVariation:20,saturationVariation:15,lightnessVariation:10,interpolate:false},
 sets:{background:'#f0f0f0',foreground:[['#ff0000','#ffff00'],['#0000ff','#ff00ff'],['#00ff00','#00ffff']],interpolate:true},
} as const;
/** Product semantics choose existing source positions; the upstream does not define emotions. */
export const EMOTION_COLOR_SOURCE:Record<EmotionKey,{preset:'palette'|'gradient'|'variations'|'sets';index:number;mix?:number}>={
 affinity:{preset:'palette',index:1},satisfaction:{preset:'palette',index:2},excitement:{preset:'gradient',index:3},relaxation:{preset:'gradient',index:1},anticipation:{preset:'gradient',index:4},
 worry:{preset:'palette',index:3},fear:{preset:'sets',index:1,mix:0},disappointment:{preset:'gradient',index:2},sadness:{preset:'variations',index:0},dissatisfaction:{preset:'sets',index:0,mix:0},aversion:{preset:'palette',index:4},
};
export const EMOTION_COLOR_RULES={dominancePower:1.4,anchorMix:.9,neutralLightness:88,neutralSaturation:12,shadeOffsets:[-10,0,12],minimumLightness:16,maximumLightness:94,saturationBase:.35,highlightMix:.35,shadeBase:.3,magentaHueMin:315,magentaHueMax:355} as const;
function componentColor(key:EmotionKey):Color {
 const source=EMOTION_COLOR_SOURCE[key];
 if(source.preset==='variations')return parseColor(UPSTREAM_COLOR_PRESETS.variations.foreground);
 if(source.preset==='sets'){const colors=UPSTREAM_COLOR_PRESETS.sets.foreground[source.index];return interpolateColors(parseColor(colors[0]),parseColor(colors[1]),source.mix??0);}
 return parseColor(UPSTREAM_COLOR_PRESETS[source.preset].foreground[source.index]);
}
/** Native single-color variations provide hue contrast; the upstream pale gradient adds a highlight.
 * Avoid the pink/magenta variation of warm sources, keeping the chosen native source instead.
 */
function componentColors(key:EmotionKey):Color[] {
 const base=componentColor(key),variants=pickColors({foreground:[base.r,base.g,base.b]},new SeededRandom('emotion-source:'+key),3).map(color=>{const hue=rgbToHsl(color).h;return hue>EMOTION_COLOR_RULES.magentaHueMin&&hue<EMOTION_COLOR_RULES.magentaHueMax?base:color;});
 return [variants[0],variants[1],interpolateColors(variants[2],parseColor(UPSTREAM_COLOR_PRESETS.gradient.foreground[2]),EMOTION_COLOR_RULES.highlightMix)];
}
/** Blend all positive inputs, then give the leading emotions one anchor each in the native three colors. */
export function emotionColors(value:unknown):ColorValue[]|undefined {
 const values=normalizeEmotionValues(value);if(!values)return undefined;
 const settings=EMOTION_COLOR_RULES;
 const neutralHue=rgbToHsl(parseColor(UPSTREAM_COLOR_PRESETS.gradient.foreground[2])).h;
 const neutral=hslToRgb(neutralHue,settings.neutralSaturation,settings.neutralLightness);
 const components=EMOTION_KEYS.flatMap(key=>{
  const intensity=values[key]??0;
  const weight=intensity**settings.dominancePower;
  return weight>0?[{intensity,weight,colors:componentColors(key)}]:[];
 });
 const anchors=[...components].sort((a,b)=>b.intensity-a.intensity);
 const peak=anchors[0]?.intensity??0;
 const strength=peak/100;
 return settings.shadeOffsets.map((offset,index)=>{
  let average=neutral,totalWeight=0;
  for(const {weight,colors} of components){
   totalWeight+=weight;
   average=interpolateColors(average,colors[index],weight/totalWeight);
  }
  const anchor=anchors[index];
  const color=anchor?interpolateColors(average,anchor.colors[index],settings.anchorMix*Math.sqrt(anchor.intensity/peak)):average;
  const hsl=rgbToHsl(interpolateColors(neutral,color,Math.sqrt(strength)));
  const saturation=hsl.s*(settings.saturationBase+(1-settings.saturationBase)*strength);
  const lightness=Math.min(settings.maximumLightness,Math.max(settings.minimumLightness,
   hsl.l+offset*(settings.shadeBase+(1-settings.shadeBase)*strength)));
  const {r,g,b}=hslToRgb(hsl.h,saturation,lightness);
  return [r,g,b] as [number,number,number];
 });
}
