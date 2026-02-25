/**
 * Parse TED eForms JSON structure into flat notices table rows.
 *
 * TED API returns JSON objects with varying structures depending on the
 * notice type and eForms version. This parser normalizes them into flat
 * rows matching the `notices` table schema.
 *
 * Multi-lot notices produce one row per lot-award pair.
 */

export interface ParsedNotice {
  ted_id: string;
  notice_type: string; // 'contract_notice', 'contract_award', 'prior_information', 'modification'
  publication_date: string;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_nuts: string | null;
  cpv_main: string | null;
  cpv_additional: string | null;
  title: string | null;
  description: string | null;
  procedure_type: string | null;
  value_estimated: number | null;
  value_awarded: number | null;
  currency: string;
  winner_name: string | null;
  winner_country: string | null;
  num_tenders_received: number | null;
  award_criteria_type: string | null;
  contract_duration_months: number | null;
  framework_agreement: number;
  original_language: string | null;
  deadline: string | null;
}

/**
 * ECB approximate exchange rates for converting to EUR.
 * Updated periodically; used for rough normalization only.
 */
export const EUR_RATES: Record<string, number> = {
  EUR: 1,
  GBP: 0.86,
  SEK: 11.3,
  DKK: 7.46,
  PLN: 4.32,
  CZK: 25.1,
  HUF: 395,
  RON: 4.97,
  BGN: 1.96,
  HRK: 7.53,
  CHF: 0.95,
  NOK: 11.5,
  USD: 1.08,
  JPY: 163,
  ISK: 150,
};

/**
 * Convert a monetary value to EUR using approximate ECB rates.
 *
 * @param value - Original monetary value
 * @param currency - ISO 4217 currency code
 * @returns Value in EUR (rounded to 2 decimal places)
 */
export function convertToEur(value: number, currency: string): number {
  const rate = EUR_RATES[currency.toUpperCase()];
  if (!rate) return value; // Unknown currency, return as-is
  return Math.round((value / rate) * 100) / 100;
}

/**
 * Normalize TED notice type codes to our standardized types.
 *
 * TED uses various type codes across different eForms versions:
 * - Legacy: CN, CAN, PIN, CORR
 * - eForms: planning, competition, result, change
 * - Numeric: 2 (contract notice), 3 (contract award), etc.
 */
export function normalizeNoticeType(code: string): string {
  const mapping: Record<string, string> = {
    // Legacy TED codes
    cn: 'contract_notice',
    can: 'contract_award',
    pin: 'prior_information',
    corr: 'modification',
    // eForms subtypes
    planning: 'prior_information',
    competition: 'contract_notice',
    result: 'contract_award',
    change: 'modification',
    // Additional mappings
    contract_notice: 'contract_notice',
    contract_award: 'contract_award',
    prior_information: 'prior_information',
    modification: 'modification',
    'contract notice': 'contract_notice',
    'contract award': 'contract_award',
    'prior information notice': 'prior_information',
    // Numeric codes from some API versions
    '2': 'contract_notice',
    '3': 'contract_award',
    '1': 'prior_information',
    '7': 'contract_notice',
    '0': 'prior_information',
  };

  const normalized = mapping[code.toLowerCase().trim()];
  return normalized || code.toLowerCase().trim();
}

/**
 * Safely extract a string value from a raw notice object.
 * Handles nested paths using dot notation (e.g., 'buyer.name').
 */
function extractString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const parts = key.split('.');
    let value: unknown = raw;

    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

/**
 * Safely extract a numeric value from a raw notice object.
 */
function extractNumber(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const parts = key.split('.');
    let value: unknown = raw;

    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }

    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Extract lots from a raw TED notice (if present).
 * Returns an array of lot objects, or a single-element array with the notice itself.
 */
function extractLots(raw: Record<string, unknown>): Record<string, unknown>[] {
  // Check for lots array under various keys
  const lotsKeys = ['lots', 'lot', 'award-details', 'awardDetails'];

  for (const key of lotsKeys) {
    const lots = raw[key];
    if (Array.isArray(lots) && lots.length > 0) {
      return lots as Record<string, unknown>[];
    }
  }

  return [raw]; // No lots structure; treat the entire notice as a single lot
}

/**
 * Parse a raw TED notice JSON object into one or more flat ParsedNotice rows.
 *
 * Multi-lot notices produce one row per lot-award pair. Each row inherits
 * the common fields (buyer, publication date, etc.) from the parent notice
 * and the lot-specific fields (value, winner, CPV) from the lot.
 *
 * @param raw - Raw JSON object from the TED API response
 * @returns Array of parsed notice rows
 */
export function parseNotice(raw: Record<string, unknown>): ParsedNotice[] {
  const tedId = extractString(
    raw,
    'notice-id',
    'noticeId',
    'notice_id',
    'id',
    'ted-id',
    'tedId'
  );

  if (!tedId) return []; // Cannot create a notice without an ID

  const noticeTypeRaw = extractString(
    raw,
    'notice-type',
    'noticeType',
    'notice_type',
    'type',
    'TD'
  );
  const noticeType = noticeTypeRaw ? normalizeNoticeType(noticeTypeRaw) : 'contract_notice';

  const publicationDate = extractString(
    raw,
    'publication-date',
    'publicationDate',
    'publication_date',
    'PD'
  ) || new Date().toISOString().slice(0, 10);

  const buyerId = extractString(raw, 'buyer-id', 'buyerId', 'buyer_id', 'buyer.id');
  const buyerName = extractString(raw, 'buyer-name', 'buyerName', 'buyer_name', 'buyer.name');
  const buyerNuts = extractString(
    raw,
    'buyer-nuts-code',
    'buyerNutsCode',
    'buyer_nuts',
    'buyer.nuts',
    'buyer-nuts'
  );

  const procedureType = extractString(
    raw,
    'procedure-type',
    'procedureType',
    'procedure_type'
  );

  const currency = extractString(raw, 'currency', 'CURRENCY') || 'EUR';

  const originalLanguage = extractString(
    raw,
    'original-language',
    'originalLanguage',
    'original_language',
    'LG'
  );
  const deadline = extractString(raw, 'deadline', 'DT_RECEIPT');
  const frameworkRaw = raw['framework-agreement'] ?? raw['frameworkAgreement'] ?? raw['framework_agreement'];
  const framework = frameworkRaw ? 1 : 0;

  // Common CPV at notice level
  const cpvNotice = extractString(
    raw,
    'cpv-code',
    'cpvCode',
    'cpv_code',
    'cpv-main',
    'cpvMain',
    'PC'
  );

  const titleNotice = extractString(raw, 'title-text', 'titleText', 'title_text', 'title', 'TI');
  const descriptionNotice = extractString(
    raw,
    'description-text',
    'descriptionText',
    'description_text',
    'description'
  );

  const awardCriteriaNotice = extractString(
    raw,
    'award-criteria-type',
    'awardCriteriaType',
    'award_criteria_type',
    'AC'
  );

  // Extract lots
  const lots = extractLots(raw);
  const results: ParsedNotice[] = [];

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const lotId = lots.length > 1 ? `${tedId}-LOT${i + 1}` : tedId;

    const cpvMain = extractString(
      lot,
      'cpv-code',
      'cpvCode',
      'cpv_code',
      'cpv-main',
      'cpvMain'
    ) || cpvNotice;

    const cpvAdditional = extractString(
      lot,
      'cpv-additional',
      'cpvAdditional',
      'cpv_additional'
    );

    const title = extractString(lot, 'title-text', 'titleText', 'title_text', 'title') || titleNotice;
    const description = extractString(
      lot,
      'description-text',
      'descriptionText',
      'description_text',
      'description'
    ) || descriptionNotice;

    const valueEstimated = extractNumber(
      lot,
      'value-estimated',
      'valueEstimated',
      'value_estimated',
      'estimatedValue'
    ) ?? extractNumber(raw, 'value-estimated', 'valueEstimated', 'value_estimated');

    const valueAwarded = extractNumber(
      lot,
      'value-awarded',
      'valueAwarded',
      'value_awarded',
      'awardedValue'
    ) ?? extractNumber(raw, 'value-awarded', 'valueAwarded', 'value_awarded');

    const winnerName = extractString(
      lot,
      'winner-name',
      'winnerName',
      'winner_name',
      'winner.name'
    );
    const winnerCountry = extractString(
      lot,
      'winner-country',
      'winnerCountry',
      'winner_country',
      'winner.country'
    );

    const numTenders = extractNumber(
      lot,
      'number-tenders-received',
      'numberTendersReceived',
      'num_tenders_received',
      'tendersReceived'
    );

    const awardCriteria = extractString(
      lot,
      'award-criteria-type',
      'awardCriteriaType',
      'award_criteria_type'
    ) || awardCriteriaNotice;

    const durationMonths = extractNumber(
      lot,
      'contract-duration-months',
      'contractDurationMonths',
      'contract_duration_months',
      'duration'
    ) ?? extractNumber(raw, 'contract-duration-months', 'contractDurationMonths');

    // Convert values to EUR if needed
    const valueEstimatedEur =
      valueEstimated !== null ? convertToEur(valueEstimated, currency) : null;
    const valueAwardedEur =
      valueAwarded !== null ? convertToEur(valueAwarded, currency) : null;

    results.push({
      ted_id: lotId,
      notice_type: noticeType,
      publication_date: publicationDate,
      buyer_id: buyerId,
      buyer_name: buyerName,
      buyer_nuts: buyerNuts,
      cpv_main: cpvMain,
      cpv_additional: cpvAdditional,
      title,
      description,
      procedure_type: procedureType,
      value_estimated: valueEstimatedEur,
      value_awarded: valueAwardedEur,
      currency: 'EUR', // Normalized to EUR
      winner_name: winnerName,
      winner_country: winnerCountry,
      num_tenders_received: numTenders,
      award_criteria_type: awardCriteria,
      contract_duration_months: durationMonths,
      framework_agreement: framework,
      original_language: originalLanguage,
      deadline,
    });
  }

  return results;
}
