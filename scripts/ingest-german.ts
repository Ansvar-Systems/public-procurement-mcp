#!/usr/bin/env tsx
/**
 * German procurement law fetcher.
 *
 * Fetches German procurement laws from gesetze-im-internet.de.
 * URL pattern: https://www.gesetze-im-internet.de/{law_id}/
 *
 * German laws use § (Paragraph) notation instead of articles.
 * For testability, parser functions accept raw HTML input.
 */

import { stripHtml, normalizeWhitespace, parseParagraphs, type ParsedArticle } from './lib/html-parser.js';

export interface GermanLawResult {
  title: string;
  articles: ParsedArticle[];
  effective_date: string | null;
  source_url: string;
}

/**
 * Map census IDs to gesetze-im-internet.de URL slugs.
 */
const GII_SLUGS: Record<string, string> = {
  'GWB_4': 'gwb',
  'VgV': 'vgv_2016',
  'SektVO': 'sektvo_2016',
  'KonzVgV': 'konzvgv',
  'VSVgV': 'vsvgv',
};

/**
 * Map census IDs to BJNR identifiers for full-text download.
 */
const GII_BJNR: Record<string, string> = {
  'GWB_4': 'BJNR252110998',
  'VgV': 'BJNR062410016',
  'SektVO': 'BJNR065700016',
  'KonzVgV': 'BJNR068300016',
  'VSVgV': 'BJNR150900012',
};

/**
 * Build the gesetze-im-internet.de URL for a given law ID.
 */
export function buildGiiUrl(lawId: string): string {
  const slug = GII_SLUGS[lawId] || lawId.toLowerCase();
  return `https://www.gesetze-im-internet.de/${slug}/`;
}

/**
 * Build the full-text HTML URL for gesetze-im-internet.de.
 */
export function buildGiiFullTextUrl(lawId: string): string {
  const slug = GII_SLUGS[lawId] || lawId.toLowerCase();
  return `https://www.gesetze-im-internet.de/${slug}/BJNR${slug.toUpperCase()}.html`;
}

/**
 * Parse German legal HTML into articles (§ paragraphs).
 *
 * gesetze-im-internet.de uses several HTML structures:
 * 1. Individual paragraph pages linked from the TOC
 * 2. Full-text HTML with § headings
 * 3. XML export format
 *
 * This parser handles the full-text HTML format.
 */
export function parseGermanArticles(html: string): ParsedArticle[] {
  // First try the generic § parser
  const paragraphs = parseParagraphs(html);
  if (paragraphs.length > 0) return paragraphs;

  // Fallback: try gesetze-im-internet specific structure
  return parseGiiStructure(html);
}

/**
 * Parse gesetze-im-internet.de specific HTML structure.
 *
 * The site uses <div class="jnhtml"> containers with
 * <span class="jnenbez">§ N</span> for paragraph numbers.
 */
function parseGiiStructure(html: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Look for paragraph designations
  const paraRe = /<span[^>]*class="[^"]*jnenbez[^"]*"[^>]*>(.*?)<\/span>/gi;
  const positions: Array<{ number: string; index: number }> = [];

  let match: RegExpExecArray | null;
  paraRe.lastIndex = 0;
  while ((match = paraRe.exec(html)) !== null) {
    // Decode HTML entities (&#167; = §) before matching
    const rawText = match[1].replace(/&#167;/g, '§').replace(/&sect;/g, '§');
    const text = stripHtml(rawText).trim();
    // Skip range entries like "§§ 4 bis 17" and TOC entries like "Inhaltsübersicht"
    if (/§§|bis\s+\d|Inhalts/i.test(text)) continue;
    const numMatch = text.match(/§\s*(\d+[a-z]?)/i) || text.match(/^(\d+[a-z]?)$/i);
    if (numMatch) {
      positions.push({ number: numMatch[1], index: match.index + match[0].length });
    }
  }

  if (positions.length === 0) return [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const start = pos.index;
    const end = i + 1 < positions.length ? positions[i + 1].index - 50 : html.length;

    const sectionHtml = html.slice(start, Math.min(end, start + 20000));
    const plainContent = normalizeWhitespace(stripHtml(sectionHtml));

    const lines = plainContent.split('\n').filter((l) => l.trim().length > 0);
    let title = '';
    let bodyLines = lines;

    // Extract title (Ueberschrift) from jnentitel span if present
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 0 && firstLine.length < 200 && !/^[\d(\[]/.test(firstLine)) {
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

  // Deduplicate
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}

/**
 * Extract the law title from gesetze-im-internet.de HTML.
 */
function extractGiiTitle(html: string): string {
  // Try <span class="jnlangue">
  const langMatch = html.match(/<span[^>]*class="[^"]*jnlangue[^"]*"[^>]*>(.*?)<\/span>/si);
  if (langMatch) {
    const t = normalizeWhitespace(stripHtml(langMatch[1]));
    if (t.length > 5) return t;
  }

  // Try <title>
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
  if (titleMatch) {
    const t = normalizeWhitespace(stripHtml(titleMatch[1]));
    if (t.length > 5) return t;
  }

  return 'Unknown German law';
}

/**
 * Parse gesetze-im-internet.de HTML content (testable without network).
 */
export function parseGermanHtml(html: string, lawId: string): GermanLawResult {
  const title = extractGiiTitle(html);

  let effectiveDate: string | null = null;
  const plainText = stripHtml(html);
  // Look for "Ausfertigungsdatum:" or enactment date
  const dateMatch = plainText.match(/(?:Ausfertigungsdatum|Datum|Stand)[:\s]+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (dateMatch) {
    effectiveDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }

  return {
    title,
    articles: parseGermanArticles(html),
    effective_date: effectiveDate,
    source_url: buildGiiUrl(lawId),
  };
}

/**
 * Fetch and parse a German law from gesetze-im-internet.de (network-dependent).
 */
export async function fetchGermanLaw(lawId: string): Promise<GermanLawResult> {
  const bjnr = GII_BJNR[lawId];
  const slug = GII_SLUGS[lawId] || lawId.toLowerCase();

  // Use full-text BJNR URL if available, otherwise fall back to index page
  const url = bjnr
    ? `https://www.gesetze-im-internet.de/${slug}/${bjnr}.html`
    : buildGiiUrl(lawId);

  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html',
      'Accept-Language': 'de',
      'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch German law ${lawId} from ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseGermanHtml(html, lawId);
}
