import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { StripSegment } from '@mieru/shared';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets');
const WIDTH = 1200;
const HEIGHT = 630;
const FAMILY_COLORS: Record<StripSegment['family'], string> = {
  compute: '#4F74B8',
  attention: '#C76A4A',
  normalization: '#3E9688',
  activation: '#D9A53F',
  shape: '#8E8AA8',
  other: '#BCC1CC',
};

let logoDataUri: string | null = null;
function logo(): string {
  logoDataUri ??= `data:image/png;base64,${readFileSync(path.join(ASSETS, 'logo.png')).toString('base64')}`;
  return logoDataUri;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface OgModel {
  name: string;
  owner: string;
  description: string | null;
  params: string | null;
  strip: StripSegment[];
}

/** Renders the 1200×630 share preview: name, owner, the architecture strip and the logo. */
export function renderOgImage(model: OgModel | null): Buffer {
  const stripTotal = model?.strip.reduce((sum, segment) => sum + segment.weight, 0) ?? 0;
  let x = 80;
  const stripWidth = WIDTH - 160;
  const segments = (model?.strip ?? [])
    .map((segment) => {
      const width = (segment.weight / (stripTotal || 1)) * stripWidth;
      const rect = `<rect x="${x.toFixed(2)}" y="470" width="${Math.max(width, 0.5).toFixed(2)}" height="22" fill="${FAMILY_COLORS[segment.family]}"/>`;
      x += width;
      return rect;
    })
    .join('');
  const body = model
    ? `<text x="80" y="300" font-family="Pretendard" font-weight="700" font-size="68" fill="#1B1E2B">${escapeXml(truncate(model.name, 30))}</text>
       <text x="80" y="356" font-family="Pretendard" font-size="30" fill="#5A6072">@${escapeXml(model.owner)}${model.params ? ` · ${escapeXml(model.params)} params` : ''}</text>
       ${model.description ? `<text x="80" y="420" font-family="Pretendard" font-size="28" fill="#5A6072">${escapeXml(truncate(model.description, 52))}</text>` : ''}
       <clipPath id="strip"><rect x="80" y="470" width="${stripWidth}" height="22" rx="6"/></clipPath>
       <g clip-path="url(#strip)">${segments}</g>`
    : `<text x="80" y="330" font-family="Pretendard" font-weight="700" font-size="64" fill="#1B1E2B">모델을 올리면, 구조가 보여요</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#F6F7FA"/>
    <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" rx="36" fill="#F1EDF8"/>
    <image x="72" y="60" width="240" height="147" href="${logo()}"/>
    ${body}
  </svg>`;
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [
        path.join(ASSETS, 'fonts/Pretendard-Regular.otf'),
        path.join(ASSETS, 'fonts/Pretendard-Bold.otf'),
      ],
      loadSystemFonts: false,
      defaultFontFamily: 'Pretendard',
    },
  });
  return Buffer.from(resvg.render().asPng());
}
