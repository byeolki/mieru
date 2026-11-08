import { channelToRgba, type ActivationGrid } from './feature-maps.js';

/** Draws one activation channel at native resolution; CSS scales it up with pixelated sampling. */
export function drawChannel(
  canvas: HTMLCanvasElement,
  data: ArrayLike<number>,
  grid: ActivationGrid,
  channel: number,
): void {
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.putImageData(
    new ImageData(channelToRgba(data, grid, channel), grid.width, grid.height),
    0,
    0,
  );
}

/** First channel as a data URL, small enough to hang on a graph node. */
export function channelPreviewUrl(data: ArrayLike<number>, grid: ActivationGrid): string {
  const canvas = document.createElement('canvas');
  drawChannel(canvas, data, grid, 0);
  return canvas.toDataURL('image/png');
}

/** Resizes an image to the model's input size and returns its RGBA pixels. */
export function imagePixels(
  image: CanvasImageSource,
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}
