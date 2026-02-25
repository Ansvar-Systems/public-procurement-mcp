#!/usr/bin/env tsx
/**
 * Swiss procurement law fetcher.
 *
 * Fetches Swiss procurement laws from Fedlex (fedlex.admin.ch).
 * Fedlex serves JSON-LD and HTML versions of federal acts.
 *
 * For testability, parser functions accept raw HTML/JSON input.
 */

import { stripHtml, normalizeWhitespace, type ParsedArticle } from './lib/html-parser.js';

export interface SwissLawResult {
  title: string;
  articles: ParsedArticle[];
  effective_date: string | null;
  source_url: string;
}

/**
 * Map census IDs to Fedlex URIs.
 */
const FEDLEX_URLS: Record<string, string> = {
  'SR-172.056.1': 'https://www.fedlex.admin.ch/eli/cc/2020/126/en',
  'SR-172.056.11': 'https://www.fedlex.admin.ch/eli/cc/2020/127/en',
};

/**
 * Build the Fedlex HTML URL for a given SR number.
 */
export function buildFedlexUrl(srId: string): string {
  return FEDLEX_URLS[srId] || `https://www.fedlex.admin.ch/eli/cc/${srId.replace('SR-', '').replace(/\./g, '/')}/en`;
}

/**
 * Parse Swiss legal HTML into articles.
 *
 * Fedlex uses "Art. N" notation for article headings.
 */
export function parseSwissArticles(html: string): ParsedArticle[] {
  const plainText = normalizeWhitespace(stripHtml(html));

  // Swiss articles use "Art. N" pattern
  const ART_RE = /(?:^|\n)\s*Art\.\s+(\d+[a-z]?)\b/gi;
  const headings: Array<{ number: string; index: number; matchLength: number }> = [];
  let match: RegExpExecArray | null;

  ART_RE.lastIndex = 0;
  while ((match = ART_RE.exec(plainText)) !== null) {
    headings.push({
      number: match[1],
      index: match.index,
      matchLength: match[0].length,
    });
  }

  if (headings.length === 0) return [];

  const articles: ParsedArticle[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const bodyStart = heading.index + heading.matchLength;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].index : plainText.length;

    let bodyText = plainText.slice(bodyStart, bodyEnd).trim();
    let title = '';

    const lines = bodyText.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (
        firstLine.length > 0 &&
        firstLine.length < 200 &&
        !/^[\d(]/.test(firstLine)
      ) {
        title = firstLine;
        bodyText = lines.slice(1).join('\n').trim();
      }
    }

    if (bodyText.length === 0 && title.length === 0) continue;

    articles.push({
      article_number: heading.number,
      title,
      body: bodyText || title,
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}

/**
 * Parse Fedlex HTML content (testable without network).
 */
export function parseSwissHtml(html: string, srId: string): SwissLawResult {
  const plainText = normalizeWhitespace(stripHtml(html));

  // Try to extract title from the document
  let title = 'Unknown Swiss law';
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
  if (titleMatch) {
    const t = normalizeWhitespace(stripHtml(titleMatch[1])).trim();
    if (t.length > 5) title = t;
  }

  // Extract date of enactment
  let effectiveDate: string | null = null;
  const dateMatch = plainText.match(/of\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (dateMatch) {
    const months: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12',
    };
    const month = months[dateMatch[2].toLowerCase()];
    if (month) {
      effectiveDate = `${dateMatch[3]}-${month}-${dateMatch[1].padStart(2, '0')}`;
    }
  }

  return {
    title,
    articles: parseSwissArticles(html),
    effective_date: effectiveDate,
    source_url: buildFedlexUrl(srId),
  };
}

/**
 * Fetch and parse a Swiss law from Fedlex (network-dependent).
 */
export async function fetchSwissLaw(srId: string): Promise<SwissLawResult> {
  const url = buildFedlexUrl(srId);

  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html',
      'Accept-Language': 'en',
      'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Swiss law ${srId} from ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseSwissHtml(html, srId);
}
