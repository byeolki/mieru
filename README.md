# mieru (見える)

> DatabaseProgramming 수행평가 프로젝트

mieru는 신경망 모델 저장소예요. 모델 파일을 올리면 구조가 그래프로 보이고, 원하는 사람과 원하는 만큼만 공유할 수 있어요. 이름은 일본어로 '보인다'는 뜻이에요.

- 서비스 주소: <https://mieru.dokploy.byeolki.me>
- 데이터베이스: MySQL 8.4, ORM 없이 직접 쓴 SQL, 테이블 21개

## 주요 기능

- **업로드**
  - `.onnx`(최대 2GB)와 `.safetensors`(최대 10GB)를 올릴 수 있어요.
  - 50MB씩 나눠 올리고, 끊기면 멈춘 곳부터 이어서 올려요(tus).
  - 가중치가 별도 파일로 나뉜 ONNX(`model.onnx` + `model.onnx_data`)도 같이 올릴 수 있어요.
- **구조 보기**
  - ONNX는 계산 그래프로, safetensors는 모듈 트리로 펼쳐져요.
  - 큰 모델은 층(블록) 단위로 접혀서 열리고, 노드를 누르면 입출력 모양과 가중치가 보여요.
- **가중치 분석:** 텐서마다 값 분포 히스토그램과 통계를 보여주고, 합성곱 필터는 이미지로 보여줘요.
- **브라우저에서 실행:** ONNX 모델을 onnxruntime-web으로 바로 돌려보고, 층마다 나온 특징 맵을 볼 수 있어요.
- **버전 관리:** 새 버전을 올리면 이전 버전과 비교해서 바뀐 노드와 가중치를 표시해요.
- **공유:** 비공개 / 지정한 사람 / 링크(만료 가능) / 공개 중에서 고르고, 보기·편집 권한과 다운로드 허용을 따로 정해요.
- **커뮤니티:** 이슈와 답글을 달고, 이슈를 그래프의 특정 노드에 연결할 수 있어요. 스타도 누를 수 있어요.
- **둘러보기:** 최근 7일 스타·조회·이슈로 계산한 "이번 주 화제"를 보여주고, 검색도 돼요.
- **설계 모드:** 레이어를 쌓아 모델을 설계하면 모양 오류를 바로 잡아주고, PyTorch 코드로 내보내요.
- **관리:** 신고를 받아 관리자가 모델을 내리거나 되돌릴 수 있어요.

## 기술 스택

| 영역         | 사용한 것                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 프론트엔드   | React 19, Vite, React Router, TanStack Query, Tailwind CSS v4, React Flow, ELK(그래프 배치), onnxruntime-web |
| 백엔드       | Node.js 22, Fastify 5, TypeScript, zod, tus(이어 올리기)                                                     |
| 데이터베이스 | MySQL 8.4, `mysql2`로 직접 쓴 SQL, SQL 마이그레이션                                                          |
| 저장소       | 서버 로컬 디스크(SHA-256으로 같은 파일은 한 번만 저장)                                                       |
| 테스트       | Vitest(유닛·통합), Playwright(e2e, 헤드리스)                                                                 |
| 배포         | Docker Compose, Dokploy(Traefik), Cloudflare Tunnel                                                          |

## 데이터베이스

테이블은 21개이고, `apps/server/migrations/`의 SQL 파일로 만들어져요.

| 분류      | 테이블                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| 계정      | `users`, `refresh_tokens`, `released_usernames`                                       |
| 모델·파일 | `models`, `model_versions`, `model_files`, `blobs`, `uploads`, `version_data_uploads` |
| 공유      | `shares`, `share_links`, `link_visits`                                                |
| 커뮤니티  | `issues`, `issue_replies`, `issue_reads`, `stars`                                     |
| 둘러보기  | `model_view_days`, `model_trending`                                                   |
| 운영      | `reports`, `audit_events`                                                             |
| 설계      | `designs`                                                                             |

마이그레이션은 4개예요.

1. `001_init.sql`: 기본 테이블 19개
2. `002_designs.sql`: 설계 모드
3. `003_external_data.sql`: 가중치가 별도 파일로 나뉜 ONNX 모델
4. `004_model_slugs.sql`: `/{사용자}/{모델}` 형태의 주소

## 폴더 구조

```text
apps/
  server/        Fastify API, 모델 분석기(ONNX·safetensors), 마이그레이션
  web/           React 웹 앱, e2e 테스트
packages/
  shared/        서버와 웹이 함께 쓰는 zod 스키마와 타입
deploy/          배포용 docker compose, DB 백업 스크립트
docs/            배포·운영 문서, 구현 계획과 결과 보고서
```

## 로컬에서 실행하기

Node.js 22.12 이상과 MySQL 8.4가 필요해요.

```bash
npm ci
cp .env.example .env    # JWT_SECRET 등 비밀값 4개를 채워주세요(파일 안 주석 참고)

# 프로젝트 전용 MySQL을 .tmp/에 설치하고 실행 (이미 MySQL이 있으면 DATABASE_URL만 맞추면 돼요)
scripts/setup-dev-mysql.sh
scripts/dev-mysql.sh

npm run build -w @mieru/shared
npm run db:migrate -w @mieru/server
npm run dev -w @mieru/server   # API: http://localhost:3000
npm run dev -w @mieru/web      # 웹: http://localhost:5173
```

## 테스트

```bash
npm run lint
npm run typecheck
npm run test:unit                       # 유닛 테스트
npm run test:integration                # 통합 테스트(TEST_DATABASE_URL의 MySQL 필요)
npm run fixtures -w @mieru/server       # e2e용 모델 파일 만들기
E2E_BASE_URL=http://localhost:5173 npm run test:e2e   # e2e(헤드리스 브라우저)
```

## 문서

- [배포](docs/deploy.md)
- [운영](docs/runbook.md)
- [구현 계획](docs/plans/mieru.md)과 [결과 보고서](docs/plans/mieru.report.md)
