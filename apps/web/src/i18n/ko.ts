export const ko = {
  common: {
    appName: 'mieru',
    explore: '둘러보기',
    login: '로그인',
    signup: '시작하기',
    newModel: '모델 올리기',
  },
  landing: {
    title: '모델을 올리면, 구조가 보여요',
    lead: 'ONNX나 safetensors 파일을 올리면 계산 그래프와 모듈 트리로 펼쳐 보여줘요. 원하는 사람과 원하는 만큼만 공유하세요.',
    primaryAction: '모델 올리기',
    secondaryAction: '화제의 모델 보기',
    stripCaption:
      '모델마다 붙는 아키텍처 스트립. 연산 종류를 순서대로 이어 붙여서, 목록에서도 구조가 한눈에 보여요.',
    pointGraphTitle: '그래프로 보기',
    pointGraphBody:
      '노드를 누르면 속성, 입출력 크기, 파라미터 수가 나와요. 큰 모델은 블록 단위로 접혀요.',
    pointShareTitle: '권한까지 정해서 공유',
    pointShareBody: '보기·편집 권한, 만료되는 링크, 다운로드 허용 여부를 사람마다 정할 수 있어요.',
    pointIssuesTitle: '이슈로 이야기하기',
    pointIssuesBody:
      '버그, 질문, 피드백을 저장소 안에서 주고받고, 그래프의 특정 노드에 연결할 수 있어요.',
    formats: '지원 형식: .onnx (최대 2GB), .safetensors (최대 10GB)',
  },
} as const;

export type Messages = typeof ko;
