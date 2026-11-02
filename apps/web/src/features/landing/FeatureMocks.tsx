import { Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArchitectureStrip } from '../../components/ArchitectureStrip.js';
import { Avatar } from '../../components/Avatar.js';
import { Sparkle } from '../../design/Sparkle.js';
import { RESNET_STRIP, TRANSFORMER_STRIP, UNET_STRIP } from './sample-strips.js';

function MockWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-fog bg-surface">
      <p className="border-b border-fog px-5 py-3 text-xs text-slate">{title}</p>
      {children}
    </div>
  );
}

export function UploadMock() {
  return (
    <MockWindow title="새 모델">
      <div className="grid gap-3 p-5 font-mono text-[13px]">
        <div className="flex justify-between">
          <span className="text-sumi">llama-3-8b.safetensors</span>
          <span className="text-slate">15.0 GB</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-fog">
          <div className="h-full w-[82%] rounded-full bg-primary" />
        </div>
        <p className="text-slate">50 MB 조각 247/301 · 연결이 끊기면 이어서 올려요</p>
        <div className="mt-2 grid gap-1.5 border-t border-fog pt-4 text-slate">
          <p>
            <span className="text-sumi">resnet50.onnx</span> 해시 확인 · 같은 파일 재사용
          </p>
          <p>
            <span className="text-sumi">resnet50.onnx</span> 그래프 분석 · 노드 176
          </p>
          <p>
            <span className="text-primary">resnet50.onnx</span> 준비됨 · 파라미터 25.6M
          </p>
        </div>
      </div>
    </MockWindow>
  );
}

const PEOPLE = [
  { username: 'mio', name: 'Mio', role: '보기', note: '다운로드 허용' },
  { username: 'kai', name: 'Kai', role: '편집', note: '다운로드 허용' },
  { username: 'ren', name: 'Ren', role: '보기', note: '다운로드 안 됨' },
];

export function ShareMock() {
  return (
    <MockWindow title="공유">
      <ul className="divide-y divide-fog">
        {PEOPLE.map((person) => (
          <li key={person.username} className="flex items-center gap-3 px-5 py-3.5 text-sm">
            <Avatar username={person.username} displayName={person.name} size={28} />
            <span className="text-sumi">@{person.username}</span>
            <span className="ml-auto text-slate">{person.note}</span>
            <span className="w-12 rounded-md border border-fog py-1 text-center text-sumi">
              {person.role}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 px-5 py-3.5 text-sm">
          <span className="grid size-7 place-items-center rounded-full border border-dashed border-lilac text-lilac">
            <Link2 className="size-3.5" />
          </span>
          <span className="text-sumi">링크로 보기</span>
          <span className="ml-auto text-slate">7일 뒤 만료</span>
        </li>
      </ul>
    </MockWindow>
  );
}

export function IssueMock() {
  return (
    <MockWindow title="이슈 #12">
      <div className="grid gap-4 p-5 text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-haze-deep px-2 py-0.5 text-xs text-sumi">질문</span>
          <span className="font-semibold text-sumi">epsilon이 기본값보다 작아요</span>
        </div>
        <span className="w-fit rounded-md border border-fog px-2 py-1 font-mono text-xs text-slate">
          /stem/bn/BatchNormalization
        </span>
        <div className="flex gap-3">
          <Avatar username="mio" displayName="Mio" size={28} />
          <p className="leading-6 text-slate">
            PyTorch 기본값은 1e-5인데 여기는 1e-6이에요. 일부러 바꾸신 건가요?
          </p>
        </div>
        <div className="flex gap-3">
          <Avatar username="kai" displayName="Kai" size={28} />
          <p className="leading-6 text-slate">
            네, 혼합 정밀도에서 학습이 더 안정적이었어요. README에 적어둘게요.
          </p>
        </div>
      </div>
    </MockWindow>
  );
}

const TRENDING = [
  { owner: 'kai', name: 'resnet50-v2', stars: 128, strip: RESNET_STRIP },
  { owner: 'mio', name: 'tiny-llama-1.1b', stars: 94, strip: TRANSFORMER_STRIP },
  { owner: 'ren', name: 'unet-seg-small', stars: 41, strip: UNET_STRIP },
];

export function TrendingMock() {
  return (
    <MockWindow title="이번 주 화제">
      <ol className="divide-y divide-fog">
        {TRENDING.map((model, index) => (
          <li key={model.name} className="grid gap-2.5 px-5 py-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="tabular w-4 text-slate">{index + 1}</span>
              <span>
                <span className="text-slate">{model.owner} / </span>
                <span className="font-semibold text-sumi">{model.name}</span>
              </span>
              <span className="tabular ml-auto flex items-center gap-1 text-slate">
                <Sparkle className="size-3" color="var(--color-mieru-pink)" /> {model.stars}
              </span>
            </div>
            <ArchitectureStrip
              segments={model.strip}
              label={`${model.name} 아키텍처`}
              height={5}
              className="ml-7"
            />
          </li>
        ))}
      </ol>
    </MockWindow>
  );
}
