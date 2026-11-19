const clamp01=(value:number)=>Math.max(0,Math.min(1,value));

export function easeFolderMotion(value:number) {
  const t=clamp01(value);
  return t*t*(3-2*t);
}

/** The overview follows the panel-relative path from the 390 × 756 preview. */
export function smellFolderPose(distance:number) {
  const depth=Math.abs(distance);
  const focus=easeFolderMotion(1-depth/.73);
  return {
    x:2+89*Math.exp(-.44*depth**1.60)+61*focus,
    y:414+Math.sin(distance*.48)*188-43*focus,
    scale:.81-.13*Math.min(2.35,depth)+.29*focus,
    unfold:easeFolderMotion(1-depth),
    opacity:1-.40*clamp01((depth-1.03)/1.34),
    visible:depth<2.7,
    caption:depth>.87&&depth<1.36&&focus<.1,
    readout:easeFolderMotion(1-depth/.49),
  };
}
