import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ModelSummary } from '@mieru/shared';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { selectOne } from '../db/query.js';
import { renderOgImage, type OgModel } from '../features/explore/og-image.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OG_CACHE_LIMIT = 200;

interface PublicModelRow {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  total_params: number | null;
  summary: ModelSummary | null;
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function formatParams(count: number | null): string | null {
  if (count === null) return null;
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
  return String(count);
}

/** Only public, live repositories get named previews; everything else stays generic. */
const PUBLIC_MODEL_SELECT = `SELECT m.id, m.name, m.description, o.username AS owner, b.total_params, b.summary
       FROM models m JOIN users o ON o.id = m.owner_id
       LEFT JOIN model_files f ON f.version_id = m.current_version_id AND f.kind = 'model'
       LEFT JOIN blobs b ON b.id = f.blob_id
      WHERE m.visibility = 'public' AND m.taken_down_at IS NULL`;

async function findPublicModel(db: DbPool, id: string): Promise<PublicModelRow | null> {
  if (!UUID.test(id)) return null;
  return selectOne<PublicModelRow>(db, `${PUBLIC_MODEL_SELECT} AND m.id = ?`, [id]);
}

/** Readable repository URL: /{username}/{slug}[/tab…]. */
const REPO_PATH = /^\/([a-z0-9][a-z0-9_-]{2,29})\/([a-z0-9._-]+)(?:\/|$)/;

async function findPublicModelByPath(db: DbPool, url: string): Promise<PublicModelRow | null> {
  const match = REPO_PATH.exec(url);
  if (!match) return null;
  return selectOne<PublicModelRow>(db, `${PUBLIC_MODEL_SELECT} AND o.username = ? AND m.slug = ?`, [
    match[1] ?? '',
    match[2] ?? '',
  ]);
}

/**
 * Serves the built SPA from the same origin as the API (one Dokploy service, no CORS), and
 * injects Open Graph tags for repository and profile URLs so chat apps show a preview.
 */
export async function registerStaticSpa(
  app: FastifyInstance,
  deps: { config: AppConfig; db: DbPool },
): Promise<void> {
  const distDir = deps.config.WEB_DIST_DIR;
  if (!distDir) return;
  const root = path.resolve(distDir);
  const template = await readFile(path.join(root, 'index.html'), 'utf8');
  const origin = new URL(deps.config.APP_ORIGIN).origin;
  const ogCache = new Map<string, Buffer>();

  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: false,
    maxAge: '1h',
    immutable: false,
  });

  const page = (meta: { title: string; description: string; image: string; url: string }) =>
    template
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
      .replace(
        /<meta name="description"[^>]*>/,
        [
          `<meta name="description" content="${escapeHtml(meta.description)}" />`,
          `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
          `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
          `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
          `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
          '<meta property="og:type" content="website" />',
          '<meta name="twitter:card" content="summary_large_image" />',
        ].join('\n    '),
      );

  const generic = {
    title: 'mieru',
    description: '신경망 모델을 올리고, 구조를 보고, 공유하세요.',
    image: `${origin}/og/default.png`,
  };

  const sendPage = async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0] ?? '/';
    if (url.startsWith('/api/')) {
      reply.callNotFound();
      return reply;
    }
    let meta = { ...generic, url: `${origin}${url}` };
    const modelId = /^\/m\/([^/]+)/.exec(url)?.[1];
    const model = modelId
      ? await findPublicModel(deps.db, modelId)
      : await findPublicModelByPath(deps.db, url);
    if (model) {
      meta = {
        title: `${model.name} · @${model.owner} | mieru`,
        description: model.description ?? `${model.owner}님의 모델을 그래프로 살펴보세요.`,
        image: `${origin}/og/m/${model.id}.png`,
        url: meta.url,
      };
    }
    return reply
      .header('cache-control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(page(meta));
  };

  app.get('/og/default.png', async (_request, reply) =>
    reply
      .type('image/png')
      .header('cache-control', 'public, max-age=86400')
      .send(renderOgImage(null)),
  );

  app.get('/og/m/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    const id = file.replace(/\.png$/, '');
    const model = await findPublicModel(deps.db, id);
    const key = model
      ? `${model.id}:${model.name}:${model.description ?? ''}:${model.total_params ?? ''}`
      : 'default';
    let image = ogCache.get(key);
    if (!image) {
      const og: OgModel | null = model
        ? {
            name: model.name,
            owner: model.owner,
            description: model.description,
            params: formatParams(model.total_params),
            strip: model.summary?.strip ?? [],
          }
        : null;
      image = renderOgImage(og);
      if (ogCache.size >= OG_CACHE_LIMIT) ogCache.delete(ogCache.keys().next().value ?? '');
      ogCache.set(key, image);
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=3600').send(image);
  });

  app.get('/', sendPage);
  app.get('/*', sendPage);
}
