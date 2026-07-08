import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

import { resolveDemoUrl } from './samples.js';

function cleanText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (article?.textContent) {
    return cleanText(article.title ? `${article.title}\n\n${article.textContent}` : article.textContent);
  }

  const fallback = dom.window.document.body?.textContent || dom.window.document.documentElement.textContent || '';
  return cleanText(fallback);
}

export async function resolveSource({ kind, value, label }) {
  if (kind === 'text') {
    return {
      label,
      mode: 'text',
      value,
      content: cleanText(value),
      title: label,
    };
  }

  const demo = resolveDemoUrl(value);
  if (demo) {
    return {
      label,
      mode: 'url',
      value,
      content: demo.text,
      title: demo.title,
      sampleId: demo.sampleId,
      fetched: false,
    };
  }

  const response = await fetch(value, {
    headers: {
      'user-agent': 'TermsWatch/1.0 (+policy compare)',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${label.toLowerCase()} (${response.status})`);
  }

  const html = await response.text();
  const content = htmlToText(html, value);
  if (!content) {
    throw new Error(`Could not extract readable content from ${label.toLowerCase()}`);
  }

  return {
    label,
    mode: 'url',
    value,
    content,
    title: value,
    fetched: true,
  };
}
