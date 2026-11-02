import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, sanitizeUrl } from './Markdown.js';

describe('sanitizeUrl', () => {
  it('keeps safe and relative URLs', () => {
    expect(sanitizeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(sanitizeUrl('/m/abc')).toBe('/m/abc');
    expect(sanitizeUrl('#usage')).toBe('#usage');
  });

  it('drops script and data URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl(' JavaScript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });
});

describe('Markdown', () => {
  it('never renders raw HTML', () => {
    const { container } = render(
      <Markdown source={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nhello'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('hello');
  });

  it('removes javascript: links', () => {
    const { container } = render(<Markdown source="[click](javascript:alert(1))" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBeFalsy();
  });

  it('marks external links as untrusted', () => {
    const { container } = render(<Markdown source="[docs](https://onnx.ai)" />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('rel')).toContain('nofollow');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('loads only https images, without a referrer', () => {
    const { container } = render(
      <Markdown source={'![a](http://insecure.example/a.png) ![b](https://cdn.example/b.png)'} />,
    );
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://cdn.example/b.png');
    expect(images[0]?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders GitHub-flavored tables', () => {
    const { container } = render(<Markdown source={'| a | b |\n|---|---|\n| 1 | 2 |'} />);
    expect(container.querySelector('table')).not.toBeNull();
  });
});
