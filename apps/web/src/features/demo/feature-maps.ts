/** Channels drawn per layer; more rarely adds information and costs a canvas each. */
export const CHANNELS_PER_LAYER = 8;

export interface ActivationGrid {
  channels: number;
  height: number;
  width: number;
}

/** Reads `[1, C, H, W]` (or `[C, H, W]`) dims; returns null for tensors that are not image-like. */
export function activationGrid(dims: readonly number[]): ActivationGrid | null {
  const spatial = dims.length === 4 ? dims.slice(1) : dims.length === 3 ? dims : null;
  if (!spatial) return null;
  const [channels, height, width] = spatial;
  if (!channels || !height || !width || height < 2 || width < 2) return null;
  return { channels, height, width };
}

/**
 * Renders one channel as grayscale RGBA, stretched to its own min..max so weak and strong
 * layers are equally readable. A constant channel renders mid-gray.
 */
export function channelToRgba(
  data: ArrayLike<number>,
  grid: ActivationGrid,
  channel: number,
): Uint8ClampedArray<ArrayBuffer> {
  const plane = grid.height * grid.width;
  const offset = channel * plane;
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < plane; index++) {
    const value = data[offset + index] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  const rgba = new Uint8ClampedArray(plane * 4);
  for (let index = 0; index < plane; index++) {
    const value = data[offset + index] ?? 0;
    const level = range > 0 ? Math.round(((value - min) / range) * 255) : 128;
    rgba.set([level, level, level, 255], index * 4);
  }
  return rgba;
}

/** Softmax over a 1-D view of `values`; stable for large logits. */
export function softmax(values: readonly number[]): number[] {
  const peak = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - peak));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

/** Indices of the `count` largest values, largest first. */
export function topIndices(values: readonly number[], count: number): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((entry) => entry.index);
}
