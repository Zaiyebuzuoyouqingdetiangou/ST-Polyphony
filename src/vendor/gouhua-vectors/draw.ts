// From 构画 (ST-SevenDaysCal 4.2.3), business/lines/vectors/draw.js.
import {pools, type Angle, type Tone} from './pools';

const toneWeights = {neutral:0.6, warm:0.2, tense:0.2};
const constraintCompensation = {neutral:1, warm:1, tense:2.5};
type Combination = {parts: [Angle, Angle, Angle]; weight: number};

export function seededRandom(seed: string) {
  let hash = 2166136261;
  for (const char of seed + ':0') hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  let state = (hash >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function buildCombinations() {
  const optional = Object.values(pools).filter(pool => pool.id !== 'relation');
  const combinations: Combination[] = [];
  for (const [index, leftPool] of optional.entries()) {
    for (const rightPool of optional.slice(index + 1)) {
      for (const relation of pools.relation.tags) {
        for (const left of leftPool.tags) {
          for (const right of rightPool.tags) {
            const parts: Combination['parts'] = [relation, left, right];
            if (parts.filter(part => part[4] >= 2).length > 1 || parts.every(part => part[3] === 'tense')) continue;
            const weight = parts.reduce((weight, part) => weight * toneWeights[part[3]] * constraintCompensation[part[3]], 1);
            combinations.push({parts, weight});
          }
        }
      }
    }
  }
  for (let round = 0; round < 80; round++) {
    const totals: Record<Tone, number> = {neutral:0, warm:0, tense:0};
    for (const {parts, weight} of combinations) for (const part of parts) totals[part[3]] += weight;
    const total = totals.neutral + totals.warm + totals.tense;
    for (const combination of combinations) {
      for (const part of combination.parts) combination.weight *= (toneWeights[part[3]] * total) / totals[part[3]];
    }
  }
  return combinations;
}

let calibrated: Combination[] | undefined;

export function drawAngles(seed: string, personIds: string[]) {
  if (!personIds.length) return [];
  const available = (calibrated ??= buildCombinations()).slice();
  const random = seededRandom(seed);
  return personIds.map(personId => {
    let target = random() * available.reduce((sum, item) => sum + item.weight, 0);
    let index = 0;
    while (index < available.length - 1 && (target -= available[index].weight) >= 0) index++;
    const [draw] = available.splice(index, 1);
    return {personId, angles:draw.parts.map(part => part[2])};
  });
}
