/**
 * TED eSender API client with pagination and rate limiting.
 *
 * Uses the TED public search API (no authentication required for basic search).
 * Expert search endpoint: POST to /notices/search with query DSL.
 *
 * API docs: https://ted.europa.eu/en/simap/api
 */

export interface TedSearchParams {
  /** Notice types to search: CN, CAN, PIN, modification */
  noticeType?: string[];
  /** Start of publication date range (YYYY-MM-DD) */
  publicationDateFrom?: string;
  /** End of publication date range (YYYY-MM-DD) */
  publicationDateTo?: string;
  /** CPV code filter */
  cpvCode?: string;
  /** NUTS region code filter */
  nutsCode?: string;
  /** Page size (max 100) */
  pageSize?: number;
  /** Page number (1-based) */
  pageNumber?: number;
}

export interface TedApiResult {
  notices: TedRawNotice[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

export interface TedRawNotice {
  /** Raw fields from TED API response */
  [key: string]: unknown;
}

/**
 * Build the expert search query for TED API v3.
 *
 * TED uses an expert search syntax where fields are queried using
 * a structured query string. We construct an appropriate query from
 * the search parameters.
 */
export function buildSearchQuery(params: TedSearchParams): string {
  const parts: string[] = [];

  if (params.publicationDateFrom && params.publicationDateTo) {
    parts.push(`PD=[${params.publicationDateFrom} TO ${params.publicationDateTo}]`);
  } else if (params.publicationDateFrom) {
    parts.push(`PD>=${params.publicationDateFrom}`);
  } else if (params.publicationDateTo) {
    parts.push(`PD<=${params.publicationDateTo}`);
  }

  if (params.noticeType && params.noticeType.length > 0) {
    const types = params.noticeType.map((t) => `"${t}"`).join(' OR ');
    parts.push(`TD=(${types})`);
  }

  if (params.cpvCode) {
    parts.push(`PC="${params.cpvCode}"`);
  }

  if (params.nutsCode) {
    parts.push(`NUTS="${params.nutsCode}"`);
  }

  return parts.join(' AND ') || '*';
}

export class TedApiClient {
  private baseUrl: string;
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly maxRequestsPerSecond: number;

  constructor(options?: { baseUrl?: string; maxRequestsPerSecond?: number }) {
    this.baseUrl = options?.baseUrl || 'https://ted.europa.eu/api/v3.0';
    this.maxRequestsPerSecond = options?.maxRequestsPerSecond || 10;
  }

  /**
   * Search TED notices with the given parameters.
   * Returns a single page of results.
   */
  async search(params: TedSearchParams): Promise<TedApiResult> {
    await this.rateLimit();

    const pageSize = Math.min(params.pageSize || 100, 100);
    const pageNumber = params.pageNumber || 1;

    const query = buildSearchQuery(params);

    const url = `${this.baseUrl}/notices/search`;
    const body = JSON.stringify({
      query,
      pageSize,
      pageNumber,
      fields: [
        'notice-id',
        'notice-type',
        'publication-date',
        'buyer-name',
        'buyer-id',
        'buyer-nuts-code',
        'cpv-code',
        'title-text',
        'description-text',
        'procedure-type',
        'value-estimated',
        'value-awarded',
        'currency',
        'winner-name',
        'winner-country',
        'number-tenders-received',
        'award-criteria-type',
        'contract-duration-months',
        'framework-agreement',
        'original-language',
        'deadline',
      ],
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `TED API error: HTTP ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    // TED API may return results under different keys depending on version
    const notices = (data.notices || data.results || []) as TedRawNotice[];
    const totalCount = (data.totalCount ?? data.total ?? notices.length) as number;

    return {
      notices,
      totalCount,
      pageNumber,
      pageSize,
    };
  }

  /**
   * Paginate through all results matching the given parameters.
   * Returns all notices across all pages.
   */
  async searchAll(params: Omit<TedSearchParams, 'pageNumber'>): Promise<TedRawNotice[]> {
    const allNotices: TedRawNotice[] = [];
    const pageSize = params.pageSize || 100;
    let page = 1;
    let total = Infinity;

    while ((page - 1) * pageSize < total) {
      const result = await this.search({ ...params, pageSize, pageNumber: page });
      allNotices.push(...result.notices);
      total = result.totalCount;
      page++;
    }

    return allNotices;
  }

  /**
   * Enforce rate limiting: max N requests per second.
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.maxRequestsPerSecond;

    if (now - this.lastRequestTime < minInterval) {
      const waitTime = minInterval - (now - this.lastRequestTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /** Total number of API requests made by this client instance. */
  get totalRequests(): number {
    return this.requestCount;
  }
}
