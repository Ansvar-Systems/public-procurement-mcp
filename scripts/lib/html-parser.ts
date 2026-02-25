/**
 * Generic HTML article parser for legal documents.
 *
 * Extracts articles/sections from HTML content by matching common legal
 * heading patterns (Article N, Art. N, § N, Section N).
 *
 * Uses regex-based parsing — no external HTML parser required.
 */

export interface ParsedArticle {
  article_number: string;
  title: string;
  body: string;
}

/**
 * Strip all HTML tags from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '');
}

/**
 * Normalize whitespace: collapse multiple spaces/newlines, trim.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * Main article heading pattern — matches:
 *   Article 1, Article 1a, Art. 1, § 1, § 1a, Section 1
 * Optionally followed by a title on the same or next line.
 *
 * The regex captures:
 *   1 = prefix ("Article", "Art.", "§", "Section")
 *   2 = number (possibly with letter suffix like "1a")
 */
const ARTICLE_HEADING_RE =
  /(?:^|\n)\s*(?:Article|Art\.|§|Section)\s+(\d+[a-z]?)\b/gi;

/**
 * Parse HTML content into an array of articles.
 *
 * Strategy: find all article heading positions in the plain-text
 * rendering of the HTML, then slice the text between consecutive
 * headings to get each article's body.
 */
export function parseArticles(html: string): ParsedArticle[] {
  const plainText = normalizeWhitespace(stripHtml(html));

  // Collect all heading matches with their positions
  const headings: Array<{ number: string; index: number; matchLength: number }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  ARTICLE_HEADING_RE.lastIndex = 0;
  while ((match = ARTICLE_HEADING_RE.exec(plainText)) !== null) {
    headings.push({
      number: match[1],
      index: match.index,
      matchLength: match[0].length,
    });
  }

  if (headings.length === 0) {
    return [];
  }

  const articles: ParsedArticle[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const bodyStart = heading.index + heading.matchLength;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].index : plainText.length;

    let bodyText = plainText.slice(bodyStart, bodyEnd).trim();

    // Extract title from the first line if present (non-numbered text before body)
    let title = '';
    const lines = bodyText.split('\n');

    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // A title is a short line (< 200 chars) that does not start with a number or parenthesis
      if (
        firstLine.length > 0 &&
        firstLine.length < 200 &&
        !/^[\d(]/.test(firstLine) &&
        !firstLine.startsWith('1.') &&
        !firstLine.startsWith('The ')
      ) {
        title = firstLine;
        bodyText = lines.slice(1).join('\n').trim();
      }
    }

    // Skip articles with empty body
    if (bodyText.length === 0 && title.length === 0) {
      continue;
    }

    articles.push({
      article_number: heading.number,
      title,
      body: bodyText || title,
    });
  }

  // Deduplicate: if the same article_number appears multiple times, keep the
  // first occurrence (some HTML has repeated headings in TOC + body).
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}

/**
 * Parse German-style paragraphs (§) from HTML.
 * German laws use § sections rather than articles.
 */
export function parseParagraphs(html: string): ParsedArticle[] {
  const plainText = normalizeWhitespace(stripHtml(html));

  const PARA_RE = /(?:^|\n)\s*§\s+(\d+[a-z]?)\b/gi;
  const headings: Array<{ number: string; index: number; matchLength: number }> = [];
  let match: RegExpExecArray | null;

  PARA_RE.lastIndex = 0;
  while ((match = PARA_RE.exec(plainText)) !== null) {
    headings.push({
      number: match[1],
      index: match.index,
      matchLength: match[0].length,
    });
  }

  if (headings.length === 0) {
    return [];
  }

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
      if (firstLine.length > 0 && firstLine.length < 200 && !/^[\d(]/.test(firstLine)) {
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

  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.article_number)) return false;
    seen.add(a.article_number);
    return true;
  });
}
