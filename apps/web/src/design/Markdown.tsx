import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SAFE_LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** Keeps relative links and http(s)/mailto URLs; drops everything else (javascript:, data:, …). */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return SAFE_LINK_PROTOCOLS.includes(parsed.protocol) ? trimmed : '';
  } catch {
    return '';
  }
}

function isHttpsUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function MarkdownLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>) {
  if (!href) return <span>{children}</span>;
  const isExternal = /^https?:/.test(href);
  return (
    <a
      {...rest}
      href={href}
      rel="nofollow ugc noopener noreferrer"
      target={isExternal ? '_blank' : undefined}
    >
      {children}
    </a>
  );
}

function MarkdownImage({ src, alt }: ComponentPropsWithoutRef<'img'>) {
  // Only https images load; anything else would leak the reader's IP over plain http or embed data.
  if (typeof src !== 'string' || !isHttpsUrl(src)) return <span>{alt}</span>;
  return <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />;
}

const components: Components = { a: MarkdownLink, img: MarkdownImage };

interface MarkdownProps {
  source: string;
  className?: string;
}

/**
 * Renders user-written Markdown (READMEs, issues, replies). Raw HTML is skipped entirely,
 * so the only way to produce markup is through Markdown syntax.
 */
export function Markdown({ source, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={sanitizeUrl}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
