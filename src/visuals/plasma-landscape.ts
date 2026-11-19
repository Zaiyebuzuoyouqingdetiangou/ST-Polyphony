import {plasmaPreset} from './presets';
import {generateAvatar} from '../vendor/avatar-generator/src/themes/plasma';
import type {AtmosphereVisual} from '../domain/presentation';
import type {EmotionValues} from '../domain/emotion';
/** A proportional crop keeps the upstream round texture round in the narrow card. */
export function drawPlasmaLandscape(target:HTMLCanvasElement,circleId:string,visual?:AtmosphereVisual,values?:EmotionValues) {
 try {
  const source=document.createElement('canvas');
  generateAvatar({...plasmaPreset(circleId,visual,values),canvas:source});
  target.width=720;target.height=160;
  const cropHeight=source.width*target.height/target.width;
  target.getContext('2d')?.drawImage(source,0,(source.height-cropHeight)/2,source.width,cropHeight,0,0,target.width,target.height);
 } catch {target.width=720;/* A canvas failure only removes the optional picture. */}
}
