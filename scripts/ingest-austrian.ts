#!/usr/bin/env tsx
/**
 * Austrian procurement law fetcher.
 *
 * Fetches Austrian procurement laws from RIS (Rechtsinformationssystem).
 * RIS URL pattern: https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=...
 *
 * For testability, parser functions accept raw HTML input.
 */

import { stripHtml, normalizeWhitespace, parseParagraphs, type ParsedArticle } from './lib/html-parser.js';

export interface AustrianLawResult {
  title: string;
  articles: ParsedArticle[];
  effective_date: string | null;
  source_url: string;
}

/**
 * Map census IDs to RIS Gesetzesnummern.
 */
const RIS_IDS: Record<string, string> = {
  'BVergG_2018': '20010295',
  'BVergGKonz_2018': '20010296',
};

/**
 * Build the RIS URL for a given law ID.
 */
export function buildRisUrl(lawId: string): string {
  const gesetzesnummer = RIS_IDS[lawId] || lawId;
  return `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${gesetzesnummer}`;
}

/**
 * Parse Austrian legal HTML into articles.
 *
 * Austrian laws use § (paragraph) notation. RIS HTML wraps each
 * paragraph in its own content section.
 */
export function parseAustrianArticles(html: string): ParsedArticle[] {
  // First try the generic § parser
  const paragraphs = parseParagraphs(html);
  if (paragraphs.length > 0) return paragraphs;

  // Fallback: try RIS-specific structure
  return parseRisStructure(html);
}

/**
 * Parse RIS-specific HTML structure.
 *
 * RIS often wraps content in <div class="Content"> blocks with
 * paragraph headers in <h3> or <span class="Paragraphbezeichnung">.
 */
function parseRisStructure(html: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Look for paragraph designations in RIS HTML
  const paraRe = /<span[^>]*class="[^"]*Paragraphbezeichnung[^"]*"[^>]*>(.*?)<\/span>/gi;
  const positions: Array<{ number: string; index: number }> = [];

  let match: RegExpExecArray | null;
  paraRe.lastIndex = 0;
  while ((match = paraRe.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    const numMatch = text.match(/§\s*(\d+[a-z]?)/i);
    if (numMatch) {
      positions.push({ number: numMatch[1], index: match.index + match[0].length });
    }
  }

  if (positions.length === 0) {
    // Last resort: just extract numbered content blocks
    const plainText = normalizeWhitespace(stripHtml(html));
    const blockRe = /(?:^|\n)\s*(?:§|Paragraph|Para\.?)\s+(\d+[a-z]?)\b/gi;
    const headings: Array<{ number: string; index: number; len: number }> = [];

    blockRe.lastIndex = 0;
    while ((match = blockRe.exec(plainText)) !== null) {
      headings.push({ number: match[1], index: match.index, len: match[0].length });
    }

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const start = h.index + h.len;
      const end = i + 1 < headings.length ? headings[i + 1].index : plainText.length;
      const body = plainText.slice(start, end).trim();
      if (body.length > 0) {
        articles.push({ article_number: h.number, title: '', body });
      }
    }

    return dedup(articles);
  }

  // Extract content between paragraph positions
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const start = pos.index;
    const end = i + 1 < positions.length ? positions[i + 1].index - 100 : html.length;

    const sectionHtml = html.slice(start, end);
    const plainContent = normalizeWhitespace(stripHtml(sectionHtml));

    const lines = plainContent.split('\n').filter((l) => l.trim().length > 0);
    let title = '';
    let bodyLines = lines;

    // First meaningful line may be the title (Ueberschrift)
    if (lines.length > 1) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 0 && firstLine.length < 200 && !/^[\d(]/.test(firstLine)) {
        title = firstLine;
        bodyLines = lines.slice(1);
      }
    }

    const body = bodyLines.join('\n').trim();
    if (body.length === 0 && title.length === 0) continue;

    articles.push({
      article_number: pos.number,
      title,
      body: body || title,
    });
  }

  return dedup(articles);
}

function dedup(articles: ParsedArticle[]): ParsedArticle[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}

/**
 * Parse RIS HTML content (testable without network).
 */
export function parseAustrianHtml(html: string, lawId: string): AustrianLawResult {
  let title = 'Unknown Austrian law';
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
  if (titleMatch) {
    const t = normalizeWhitespace(stripHtml(titleMatch[1])).trim();
    if (t.length > 5) title = t;
  }

  let effectiveDate: string | null = null;
  const plainText = stripHtml(html);
  // Look for "Inkrafttretedatum", "Inkrafttreten", or similar date patterns
  const dateMatch = plainText.match(/(?:Inkrafttretedatum|Inkrafttreten|In Kraft getreten?|Geltung ab)[:\s]+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (dateMatch) {
    effectiveDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }

  return {
    title,
    articles: parseAustrianArticles(html),
    effective_date: effectiveDate,
    source_url: buildRisUrl(lawId),
  };
}

/**
 * Fetch and parse an Austrian law from RIS (network-dependent).
 */
export async function fetchAustrianLaw(lawId: string): Promise<AustrianLawResult> {
  const url = buildRisUrl(lawId);

  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html',
      'Accept-Language': 'de',
      'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Austrian law ${lawId} from ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseAustrianHtml(html, lawId);
}
