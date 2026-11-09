import type { DesignLayer, DesignSpec } from '@mieru/shared';

export type Shape = readonly number[];

export type LayerResult =
  | { status: 'ok'; input: Shape; output: Shape; params: number }
  | {
      status: 'error';
      input: Shape;
      message: string;
      /** A one-click correction, e.g. `{ inFeatures: 128 }`, when the mistake is a mismatch. */
      fix?: Partial<DesignLayer>;
    }
  /** A layer after a broken one: its input is unknown, so it is not checked. */
  | { status: 'blocked' };

export interface InferenceResult {
  layers: LayerResult[];
  /** Final output shape, or null when any layer failed. */
  output: Shape | null;
  totalParams: number;
}

type Step = { output: Shape; params: number } | { message: string; fix?: Partial<DesignLayer> };

function needsImage(shape: Shape, name: string): Step | null {
  return shape.length === 4
    ? null
    : {
        message: `${name}은(는) [N, C, H, W] 모양의 입력이 필요해요. 지금 입력은 ${formatShape(shape)}예요.`,
      };
}

function slide(size: number, kernel: number, stride: number, padding: number): number {
  return Math.floor((size + 2 * padding - kernel) / stride) + 1;
}

export function formatShape(shape: Shape): string {
  return `[${shape.join(', ')}]`;
}

function step(layer: DesignLayer, input: Shape): Step {
  const [batch = 1, channels = 0, height = 0, width = 0] = input;
  switch (layer.type) {
    case 'conv2d': {
      const notImage = needsImage(input, 'Conv2d');
      if (notImage) return notImage;
      if (layer.inChannels !== channels) {
        return {
          message: `in_channels가 ${String(layer.inChannels)}인데 들어오는 채널은 ${String(channels)}개예요.`,
          fix: { inChannels: channels },
        };
      }
      const outHeight = slide(height, layer.kernelSize, layer.stride, layer.padding);
      const outWidth = slide(width, layer.kernelSize, layer.stride, layer.padding);
      if (outHeight < 1 || outWidth < 1) {
        return {
          message: `커널(${String(layer.kernelSize)})이 입력 ${String(height)}×${String(width)}보다 커요.`,
        };
      }
      return {
        output: [batch, layer.outChannels, outHeight, outWidth],
        params: layer.outChannels * layer.inChannels * layer.kernelSize ** 2 + layer.outChannels,
      };
    }
    case 'batchnorm2d': {
      const notImage = needsImage(input, 'BatchNorm2d');
      if (notImage) return notImage;
      if (layer.numFeatures !== channels) {
        return {
          message: `num_features가 ${String(layer.numFeatures)}인데 들어오는 채널은 ${String(channels)}개예요.`,
          fix: { numFeatures: channels },
        };
      }
      return { output: input, params: 2 * channels };
    }
    case 'maxpool2d':
    case 'avgpool2d': {
      const notImage = needsImage(input, layer.type === 'maxpool2d' ? 'MaxPool2d' : 'AvgPool2d');
      if (notImage) return notImage;
      const outHeight = slide(height, layer.kernelSize, layer.stride, 0);
      const outWidth = slide(width, layer.kernelSize, layer.stride, 0);
      if (outHeight < 1 || outWidth < 1) {
        return {
          message: `풀링 크기(${String(layer.kernelSize)})가 입력 ${String(height)}×${String(width)}보다 커요.`,
        };
      }
      return { output: [batch, channels, outHeight, outWidth], params: 0 };
    }
    case 'adaptiveavgpool2d': {
      const notImage = needsImage(input, 'AdaptiveAvgPool2d');
      if (notImage) return notImage;
      return { output: [batch, channels, layer.outputSize, layer.outputSize], params: 0 };
    }
    case 'flatten':
      return {
        output: [batch, input.slice(1).reduce((product, dim) => product * dim, 1)],
        params: 0,
      };
    case 'linear': {
      const features = input[input.length - 1] ?? 0;
      if (layer.inFeatures !== features) {
        return {
          message: `in_features가 ${String(layer.inFeatures)}인데 들어오는 값은 ${String(features)}개예요.`,
          fix: { inFeatures: features },
        };
      }
      return {
        output: [...input.slice(0, -1), layer.outFeatures],
        params: layer.inFeatures * layer.outFeatures + layer.outFeatures,
      };
    }
    case 'relu':
    case 'gelu':
    case 'sigmoid':
    case 'tanh':
    case 'dropout':
    case 'softmax':
      return { output: input, params: 0 };
  }
}

/** Walks the chain from the input shape; the first failure blocks everything after it. */
export function inferShapes(spec: DesignSpec): InferenceResult {
  let current: Shape | null = spec.input.shape;
  let totalParams = 0;
  const layers = spec.layers.map((layer): LayerResult => {
    if (!current) return { status: 'blocked' };
    const input = current;
    const result = step(layer, input);
    if ('message' in result) {
      current = null;
      return { status: 'error', input, message: result.message, fix: result.fix };
    }
    current = result.output;
    totalParams += result.params;
    return { status: 'ok', input, output: result.output, params: result.params };
  });
  return { layers, output: current, totalParams };
}
