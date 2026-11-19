import { generateAvatar } from '../vendor/avatar-generator/src/themes/interference';

export type InterferenceColors = [[number, number, number], [number, number, number]];

export const NIGHT_INTERFERENCE_COLORS: InterferenceColors = [[34, 78, 132], [28, 113, 105]];
const NIGHT_KEY = NIGHT_INTERFERENCE_COLORS.flat().join(',');
const TEXTURE_SIZE = 384;
const DYNAMIC_CACHE_SIZE = 4;
const DYNAMIC_CACHE_TTL = 60_000;
let nightTexture: string | undefined;
const dynamicTextures = new Map<string, { texture: string; expiresAt: number }>();

function staggerTexture(canvas: HTMLCanvasElement) {
  try {
    const context = canvas.getContext('2d');
    if (typeof context?.getImageData !== 'function') return;
    const size = TEXTURE_SIZE;
    const image = context.getImageData(0, 0, size, size);
    const pixels = image.data;
    const stride = size * 4;
    const row = new Uint8ClampedArray(stride);
    const upperOffset = -Math.round(size * .114);
    const lowerOffset = -Math.round(size * .014);
    for (let y = 0; y < size; y++) {
      const start = y * stride;
      // Keep both glows intact. Transition offsets in the pale band between them.
      const transition = Math.max(0, Math.min(1, (y / size - .608) / .075));
      const blend = transition * transition * (3 - 2 * transition);
      const offset = upperOffset + (lowerOffset - upperOffset) * blend;
      row.set(pixels.subarray(start, start + stride));
      for (let x = 0; x < size; x++) {
        const position = x - offset;
        const sample = position < 0 ? -position : position > size - 1 ? 2 * (size - 1) - position : position;
        const near = Math.floor(sample);
        const fraction = sample - near;
        const first = near * 4;
        const second = Math.min(size - 1, near + 1) * 4;
        const output = start + x * 4;
        for (let channel = 0; channel < 3; channel++) {
          pixels[output + channel] = Math.round(row[first + channel] * (1 - fraction) + row[second + channel] * fraction);
        }
      }
    }
    context.putImageData(image, 0, 0);
  } catch {
    // Readback may be restricted. The native Interference image is already on the canvas.
  }
}

function renderTexture(colors: InterferenceColors): string {
  const canvas = generateAvatar({ id: '6', size: TEXTURE_SIZE, foreground: colors, interpolate: false });
  staggerTexture(canvas);
  return canvas.toDataURL('image/png');
}

export function createBlueGlassTexture(colors: InterferenceColors = NIGHT_INTERFERENCE_COLORS): string {
  const key = colors.flat().join(',');
  if (key === NIGHT_KEY) return nightTexture ??= renderTexture(NIGHT_INTERFERENCE_COLORS);
  const now = Date.now();
  for (const [cachedKey, entry] of dynamicTextures) {
    if (entry.expiresAt <= now) dynamicTextures.delete(cachedKey);
  }
  const cached = dynamicTextures.get(key);
  if (cached) {
    dynamicTextures.delete(key);
    dynamicTextures.set(key, cached);
    return cached.texture;
  }
  const texture = renderTexture(colors);
  dynamicTextures.set(key, { texture, expiresAt: now + DYNAMIC_CACHE_TTL });
  if (dynamicTextures.size > DYNAMIC_CACHE_SIZE) dynamicTextures.delete(dynamicTextures.keys().next().value!);
  return texture;
}
