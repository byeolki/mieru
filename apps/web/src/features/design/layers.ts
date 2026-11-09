import type { DesignLayer, DesignLayerType, DesignSpec } from '@mieru/shared';
import type { OpFamily } from '../../design/op-palette.js';
import type { Shape } from './inference.js';

export interface LayerKind {
  type: DesignLayerType;
  label: string;
  family: OpFamily;
  description: string;
}

/** The palette, grouped the way people reach for them: feature extraction, then the head. */
export const LAYER_KINDS: LayerKind[] = [
  { type: 'conv2d', label: 'Conv2d', family: 'compute', description: '이미지 특징을 뽑는 합성곱' },
  {
    type: 'batchnorm2d',
    label: 'BatchNorm2d',
    family: 'normalization',
    description: '채널별 정규화',
  },
  { type: 'relu', label: 'ReLU', family: 'activation', description: '음수를 0으로' },
  { type: 'gelu', label: 'GELU', family: 'activation', description: '부드러운 ReLU' },
  { type: 'maxpool2d', label: 'MaxPool2d', family: 'shape', description: '영역 최댓값으로 줄이기' },
  { type: 'avgpool2d', label: 'AvgPool2d', family: 'shape', description: '영역 평균으로 줄이기' },
  {
    type: 'adaptiveavgpool2d',
    label: 'AdaptiveAvgPool2d',
    family: 'shape',
    description: '원하는 크기로 평균',
  },
  { type: 'flatten', label: 'Flatten', family: 'shape', description: '한 줄로 펴기' },
  { type: 'linear', label: 'Linear', family: 'compute', description: '완전연결 층' },
  { type: 'dropout', label: 'Dropout', family: 'other', description: '학습 중 일부를 끄기' },
  { type: 'sigmoid', label: 'Sigmoid', family: 'activation', description: '0~1로 누르기' },
  { type: 'tanh', label: 'Tanh', family: 'activation', description: '-1~1로 누르기' },
  { type: 'softmax', label: 'Softmax', family: 'activation', description: '확률로 바꾸기' },
];

export const kindOf = (type: DesignLayerType): LayerKind =>
  LAYER_KINDS.find((kind) => kind.type === type) ?? (LAYER_KINDS[0] as LayerKind);

let counter = 0;
const nextId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * A new layer whose sizes already fit the incoming shape, so dropping a block rarely starts
 * out broken. `input` is the shape flowing into the insertion point.
 */
export function createLayer(type: DesignLayerType, input: Shape | null): DesignLayer {
  const channels = input?.length === 4 ? (input[1] ?? 1) : 16;
  const features = input?.[input.length - 1] ?? 128;
  const id = nextId();
  switch (type) {
    case 'conv2d':
      return {
        id,
        type,
        inChannels: channels,
        outChannels: channels * 2,
        kernelSize: 3,
        stride: 1,
        padding: 1,
      };
    case 'batchnorm2d':
      return { id, type, numFeatures: channels };
    case 'maxpool2d':
    case 'avgpool2d':
      return { id, type, kernelSize: 2, stride: 2 };
    case 'adaptiveavgpool2d':
      return { id, type, outputSize: 1 };
    case 'linear':
      return { id, type, inFeatures: features, outFeatures: 10 };
    case 'dropout':
      return { id, type, p: 0.5 };
    default:
      return { id, type };
  }
}

export const TEMPLATES: { name: string; spec: DesignSpec }[] = [
  {
    name: 'MNIST 다층 퍼셉트론',
    spec: {
      input: { shape: [1, 784] },
      layers: [
        { id: 't1', type: 'linear', inFeatures: 784, outFeatures: 256 },
        { id: 't2', type: 'relu' },
        { id: 't3', type: 'dropout', p: 0.2 },
        { id: 't4', type: 'linear', inFeatures: 256, outFeatures: 10 },
      ],
    },
  },
  {
    name: 'CIFAR-10 작은 CNN',
    spec: {
      input: { shape: [1, 3, 32, 32] },
      layers: [
        {
          id: 'c1',
          type: 'conv2d',
          inChannels: 3,
          outChannels: 32,
          kernelSize: 3,
          stride: 1,
          padding: 1,
        },
        { id: 'c2', type: 'batchnorm2d', numFeatures: 32 },
        { id: 'c3', type: 'relu' },
        { id: 'c4', type: 'maxpool2d', kernelSize: 2, stride: 2 },
        {
          id: 'c5',
          type: 'conv2d',
          inChannels: 32,
          outChannels: 64,
          kernelSize: 3,
          stride: 1,
          padding: 1,
        },
        { id: 'c6', type: 'batchnorm2d', numFeatures: 64 },
        { id: 'c7', type: 'relu' },
        { id: 'c8', type: 'adaptiveavgpool2d', outputSize: 1 },
        { id: 'c9', type: 'flatten' },
        { id: 'c10', type: 'linear', inFeatures: 64, outFeatures: 10 },
      ],
    },
  },
];
