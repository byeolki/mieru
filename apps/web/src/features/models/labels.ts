import type { Visibility } from '@mieru/shared';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: '비공개',
  users: '지정한 사람',
  link: '링크 공유',
  public: '공개',
};

export const FORMAT_LABELS = { onnx: 'ONNX', safetensors: 'safetensors' } as const;

/** User-facing reasons for a failed upload, keyed by the server's stable parse codes. */
export const FAILURE_REASONS: Record<string, string> = {
  bad_header: '파일 앞부분이 이 형식의 모양이 아니에요. 확장자가 맞는지 확인해주세요.',
  truncated: '파일이 중간에 끊겨 있어요. 다시 내보내서 올려주세요.',
  bad_protobuf: 'ONNX 파일의 구조가 깨져 있어요. 다시 내보내서 올려주세요.',
  bad_json: 'safetensors 헤더가 올바른 JSON이 아니에요.',
  offsets_invalid: 'safetensors 텐서 위치 정보가 맞지 않아요. 파일이 손상됐을 수 있어요.',
  unsupported_dtype: '지원하지 않는 데이터 타입이 들어 있어요.',
  limits_exceeded: '노드나 텐서가 너무 많아서 분석할 수 없어요.',
  external_data_unsupported:
    '외부 데이터 파일(.data)을 쓰는 ONNX 모델은 아직 지원하지 않아요. 하나의 파일로 내보내주세요.',
  external_data_missing:
    '모델이 가리키는 외부 데이터 파일이 없거나 중간에 잘려 있어요. .onnx와 데이터 파일을 같이 골라서 다시 올려주세요.',
  timeout: '분석이 너무 오래 걸려서 멈췄어요.',
  internal: '분석하다가 문제가 생겼어요. 다시 올려주세요.',
};
