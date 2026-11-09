// Diverging map for single-channel filters: negative weights blue, positive pink, zero white.
const NEGATIVE = [79, 116, 184] as const;
const POSITIVE = [188, 61, 134] as const;
const NEUTRAL = [255, 255, 255] as const;

function mix(
  from: readonly number[],
  to: readonly number[],
  amount: number,
): [number, number, number] {
  return [0, 1, 2].map((index) =>
    Math.round((from[index] ?? 0) + ((to[index] ?? 0) - (from[index] ?? 0)) * amount),
  ) as [number, number, number];
}

/** RGBA for one gray-filter value, scaled by the largest magnitude so zero stays white. */
export function divergingColor(
  value: number,
  maxMagnitude: number,
): [number, number, number, number] {
  const amount = maxMagnitude > 0 ? Math.min(Math.abs(value) / maxMagnitude, 1) : 0;
  const [r, g, b] = mix(NEUTRAL, value < 0 ? NEGATIVE : POSITIVE, amount);
  return [r, g, b, 255];
}

/** RGBA pixels for a CHW 3-channel kernel, stretched to [min, max] like the classic first-layer view. */
export function rgbKernelPixels(
  values: readonly number[],
  plane: number,
  min: number,
  max: number,
): Uint8ClampedArray<ArrayBuffer> {
  const range = max - min || 1;
  const pixels = new Uint8ClampedArray(plane * 4);
  for (let pixel = 0; pixel < plane; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      pixels[pixel * 4 + channel] = Math.round(
        (((values[channel * plane + pixel] ?? min) - min) / range) * 255,
      );
    }
    pixels[pixel * 4 + 3] = 255;
  }
  return pixels;
}
