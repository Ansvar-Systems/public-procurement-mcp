/**
 * EUR-Lex specific parser for EU directives.
 *
 * Fetches EU directives from EUR-Lex by CELEX number and parses them
 * into structured article data.
 *
 * URL pattern: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex}
 *
 * Parser functions accept raw HTML so tests can run without network access.
 */

import { stripHtml, normalizeWhitespace, type ParsedArticle } from './html-parser.js';

export interface EurLexResult {
  title: string;
  articles: ParsedArticle[];
  effective_date: string | null;
  source_url: string;
}

/**
 * Build the EUR-Lex HTML URL for a given CELEX number.
 * Uses the Cellar XHTML endpoint which doesn't have WAF/captcha protection.
 */
export function buildEurLexUrl(celex: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`;
}

/**
 * Build the Cellar XHTML URL (bypasses EUR-Lex WAF).
 */
export function buildCellarUrl(celex: string): string {
  return `http://publications.europa.eu/resource/celex/${celex}.ENG.xhtml`;
}

/**
 * Extract the directive title from EUR-Lex HTML.
 *
 * EUR-Lex typically has the title in <p class="oj-doc-ti"> or in
 * the first <title> element, or within the document header area.
 */
export function extractTitle(html: string): string {
  // Try <p class="oj-doc-ti"> first (most common)
  const tiMatch = html.match(/<p[^>]*class="[^"]*oj-doc-ti[^"]*"[^>]*>(.*?)<\/p>/si);
  if (tiMatch) {
    return normalizeWhitespace(stripHtml(tiMatch[1]));
  }

  // Try <title> tag
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/si);
  if (titleMatch) {
    const t = normalizeWhitespace(stripHtml(titleMatch[1]));
    if (t.length > 10) return t;
  }

  // Try first <h1> or <h2>
  const hMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/si);
  if (hMatch) {
    return normalizeWhitespace(stripHtml(hMatch[1]));
  }

  return 'Unknown directive';
}

/**
 * Extract the effective / entry-into-force date from EUR-Lex HTML.
 *
 * Looks for patterns like "entered into force on DD Month YYYY" or
 * "shall apply from DD Month YYYY" in the final articles.
 */
export function extractEffectiveDate(html: string): string | null {
  const plainText = stripHtml(html);

  // Pattern: "enter into force on the ... day ... publication"
  // Pattern: "shall apply from DD Month YYYY"
  const datePatterns = [
    /shall\s+apply\s+from\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    /enter(?:ed|s)?\s+into\s+force\s+on\s+(?:the\s+)?(\d{1,2}\s+\w+\s+\d{4})/i,
    /entry\s+into\s+force[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const m = plainText.match(pattern);
    if (m) {
      const dateStr = m[1] || `${m[1]} ${m[2]} ${m[3]}`;
      return parseDateString(dateStr);
    }
  }

  return null;
}

/**
 * Parse a date string like "26 February 2014" into ISO format "2014-02-26".
 */
function parseDateString(dateStr: string): string | null {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  const m = dateStr.trim().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;

  const day = m[1].padStart(2, '0');
  const month = months[m[2].toLowerCase()];
  const year = m[3];

  if (!month) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Parse EUR-Lex HTML into structured articles.
 *
 * EUR-Lex uses several HTML structures across different documents:
 * 1. <div class="eli-subdivision" id="art_N"> with article content
 * 2. <p class="oj-ti-art">Article N</p> followed by content paragraphs
 * 3. Plain text with "Article N" headings
 *
 * This parser handles all three patterns.
 */
export function parseEurLexArticles(html: string): ParsedArticle[] {
  // Strategy 1: Try eli-subdivision divs (modern EUR-Lex format)
  const eliArticles = parseEliSubdivisions(html);
  if (eliArticles.length > 0) return eliArticles;

  // Strategy 2: Try oj-ti-art paragraphs (older Official Journal format)
  const ojArticles = parseOjTiArt(html);
  if (ojArticles.length > 0) return ojArticles;

  // Strategy 3: Fallback to plain-text article headings
  return parsePlainTextArticles(html);
}

/**
 * Strategy 1: Parse <div class="eli-subdivision"> elements.
 */
function parseEliSubdivisions(html: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  // Match eli-subdivision divs that contain article IDs
  const divRe = /<div[^>]*class="[^"]*eli-subdivision[^"]*"[^>]*id="(art[_-]?\d+[a-z]?)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*eli-subdivision[^"]*"|<\/body>)/gi;

  let match: RegExpExecArray | null;
  divRe.lastIndex = 0;
  while ((match = divRe.exec(html)) !== null) {
    const artId = match[1];
    const content = match[2];

    // Extract article number from id like "art_1" or "art-2a"
    const numMatch = artId.match(/art[_-]?(\d+[a-z]?)/i);
    if (!numMatch) continue;

    const plainContent = normalizeWhitespace(stripHtml(content));
    const lines = plainContent.split('\n').filter((l) => l.trim().length > 0);

    let title = '';
    let bodyLines = lines;

    // First line after the "Article N" heading is often the title
    if (lines.length > 1) {
      const firstLine = lines[0].trim();
      // Skip lines that ARE the article heading itself
      if (/^Article\s+\d+/i.test(firstLine)) {
        if (lines.length > 2 && lines[1].length < 200 && !/^[\d(]/.test(lines[1])) {
          title = lines[1].trim();
          bodyLines = lines.slice(2);
        } else {
          bodyLines = lines.slice(1);
        }
      } else if (firstLine.length < 200 && !/^[\d(]/.test(firstLine)) {
        title = firstLine;
        bodyLines = lines.slice(1);
      }
    }

    const body = bodyLines.join('\n').trim();
    if (body.length === 0 && title.length === 0) continue;

    articles.push({
      article_number: numMatch[1],
      title,
      body: body || title,
    });
  }

  return dedup(articles);
}

/**
 * Strategy 2: Parse <p class="oj-ti-art"> elements.
 */
function parseOjTiArt(html: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Split at each article heading paragraph
  const parts = html.split(/<p[^>]*class="[^"]*oj-ti-art[^"]*"[^>]*>/i);
  if (parts.length <= 1) return [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Extract article number from the heading text
    const headingEnd = part.indexOf('</p>');
    if (headingEnd === -1) continue;

    const headingText = stripHtml(part.slice(0, headingEnd)).trim();
    const numMatch = headingText.match(/Article\s+(\d+[a-z]?)/i);
    if (!numMatch) continue;

    // The body is everything after the closing </p> until the next split point
    const bodyHtml = part.slice(headingEnd + 4);
    const plainBody = normalizeWhitespace(stripHtml(bodyHtml));

    const lines = plainBody.split('\n').filter((l) => l.trim().length > 0);
    let title = '';
    let bodyLines = lines;

    // Check for a title line
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
      article_number: numMatch[1],
      title,
      body: body || title,
    });
  }

  return dedup(articles);
}

/**
 * Strategy 3: Plain-text fallback using regex article headings.
 */
function parsePlainTextArticles(html: string): ParsedArticle[] {
  const plainText = normalizeWhitespace(stripHtml(html));

  const ARTICLE_RE = /(?:^|\n)\s*Article\s+(\d+[a-z]?)\b/gi;
  const headings: Array<{ number: string; index: number; matchLength: number }> = [];
  let match: RegExpExecArray | null;

  ARTICLE_RE.lastIndex = 0;
  while ((match = ARTICLE_RE.exec(plainText)) !== null) {
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

  return dedup(articles);
}

/**
 * Deduplicate articles by article_number (keep first occurrence).
 */
function dedup(articles: ParsedArticle[]): ParsedArticle[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}

/**
 * Fetch and parse a directive from EUR-Lex.
 *
 * This is the network-dependent entry point. For tests, use
 * parseEurLexHtml() directly with fixture HTML.
 */
export async function fetchAndParseDirective(celex: string): Promise<EurLexResult> {
  // Try Cellar XHTML first (no WAF), fall back to EUR-Lex HTML
  const cellarUrl = buildCellarUrl(celex);
  const eurLexUrl = buildEurLexUrl(celex);

  let html: string;
  let response = await fetch(cellarUrl, {
    headers: { 'Accept': 'application/xhtml+xml,text/html' },
    redirect: 'follow',
  });

  if (response.ok) {
    html = await response.text();
    // Cellar may return empty or very short error pages
    if (html.length > 1000) {
      return parseEurLexHtml(html, celex);
    }
  }

  // Fallback to EUR-Lex HTML
  response = await fetch(eurLexUrl, {
    headers: {
      'Accept': 'text/html',
      'Accept-Language': 'en',
      'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${eurLexUrl}: HTTP ${response.status}`);
  }

  html = await response.text();
  if (html.length < 1000) {
    throw new Error(`EUR-Lex returned empty/WAF page for ${celex} (${html.length} bytes)`);
  }
  return parseEurLexHtml(html, celex);
}

/**
 * Parse EUR-Lex HTML content (testable without network).
 */
export function parseEurLexHtml(html: string, celex: string): EurLexResult {
  return {
    title: extractTitle(html),
    articles: parseEurLexArticles(html),
    effective_date: extractEffectiveDate(html),
    source_url: buildEurLexUrl(celex),
  };
}
