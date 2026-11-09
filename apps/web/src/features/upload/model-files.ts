const MODEL_EXTENSION = /\.(onnx|safetensors)$/i;

export type FileSplit =
  | { ok: true; model: File; dataFiles: File[] }
  | { ok: false; reason: 'no_model' | 'several_models' | 'data_needs_onnx' };

/**
 * Splits picked files into the model file and its external data files. Exactly one
 * `.onnx`/`.safetensors` must be among them; anything else is external data, which only ONNX
 * models can have.
 */
export function splitModelFiles(files: readonly File[]): FileSplit {
  const models = files.filter((file) => MODEL_EXTENSION.test(file.name));
  if (models.length === 0) return { ok: false, reason: 'no_model' };
  if (models.length > 1) return { ok: false, reason: 'several_models' };
  const [model] = models;
  if (!model) return { ok: false, reason: 'no_model' };
  const dataFiles = files.filter((file) => file !== model);
  if (dataFiles.length > 0 && !model.name.toLowerCase().endsWith('.onnx')) {
    return { ok: false, reason: 'data_needs_onnx' };
  }
  return { ok: true, model, dataFiles };
}

export const FILE_SPLIT_ERRORS: Record<Exclude<FileSplit, { ok: true }>['reason'], string> = {
  no_model: '.onnx나 .safetensors 모델 파일을 같이 골라주세요.',
  several_models: '모델 파일은 한 번에 하나만 올릴 수 있어요.',
  data_needs_onnx: '외부 데이터 파일은 ONNX 모델에만 붙일 수 있어요.',
};
