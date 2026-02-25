#!/usr/bin/env tsx
/**
 * Ingest CPV codes, NUTS regions, thresholds, procedure types, and exclusion grounds.
 *
 * CPV codes: fetched from EU Publications Office CSV
 * NUTS regions: fetched from Eurostat CSV
 * Thresholds, procedure types, exclusion grounds: hardcoded reference data
 *
 * Idempotent: uses INSERT OR REPLACE / INSERT OR IGNORE.
 *
 * Usage: npm run ingest:reference
 */

import { createAdapter, getDefaultDbPath } from '../src/database/adapter.js';
import type { DatabaseAdapter } from '../src/database/adapter.js';

// ── CPV Codes ───────────────────────────────────────────────────────────────

const CPV_CSV_URL =
  'https://op.europa.eu/o/opportal-service/euvoc-download-handler?cellarURI=http%3A%2F%2Fpublications.europa.eu%2Fresource%2Fdataset%2Fcpv&fileName=cpv-2008.csv';

export interface CpvCode {
  code: string;
  description_en: string;
  description_de: string | null;
  description_fr: string | null;
  parent_code: string | null;
  level: number;
}

/**
 * Determine CPV hierarchy level from the code structure.
 *
 * CPV codes are 8 digits + 1 check digit: DDGGCCSS-V
 * - DD000000 (2 digits): Division (level 1)
 * - DDG00000 (3 digits): Group (level 2)
 * - DDGC0000 (4 digits): Class (level 3)
 * - DDGCC000 (5 digits): Category (level 4)
 * - DDGCCS00 (6 digits): Subcategory (level 5)
 * Format with check digit: 45000000-7
 */
export function determineCpvLevel(code: string): number {
  // Strip check digit if present (format: 45000000-7 or 45000000)
  const numericPart = code.replace(/-\d$/, '').replace(/\D/g, '').padEnd(8, '0');

  if (numericPart.slice(2) === '000000') return 1; // Division
  if (numericPart.slice(3) === '00000') return 2;  // Group
  if (numericPart.slice(4) === '0000') return 3;   // Class
  if (numericPart.slice(5) === '000') return 4;     // Category
  if (numericPart.slice(6) === '00') return 5;      // Subcategory
  if (numericPart.slice(7) === '0') return 6;
  return 7;
}

/**
 * Determine the parent CPV code from a given code.
 */
export function determineParentCode(code: string): string | null {
  const numericPart = code.replace(/-\d$/, '').replace(/\D/g, '').padEnd(8, '0');

  // Division level has no parent
  if (numericPart.slice(2) === '000000') return null;

  // Find the parent by zeroing out the last significant digit group
  if (numericPart.slice(3) === '00000') return numericPart.slice(0, 2) + '000000';
  if (numericPart.slice(4) === '0000') return numericPart.slice(0, 3) + '00000';
  if (numericPart.slice(5) === '000') return numericPart.slice(0, 4) + '0000';
  if (numericPart.slice(6) === '00') return numericPart.slice(0, 5) + '000';
  if (numericPart.slice(7) === '0') return numericPart.slice(0, 6) + '00';
  return numericPart.slice(0, 7) + '0';
}

/**
 * Parse CPV codes from CSV content.
 *
 * Expected columns (semicolon-separated): Code;EN;DE;FR (or similar).
 * The actual CSV format from the EU Publications Office varies;
 * we handle multiple formats.
 */
export function parseCpvCsv(csvContent: string): CpvCode[] {
  const lines = csvContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const codes: CpvCode[] = [];
  const separator = lines[0].includes(';') ? ';' : ',';

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(separator).map((p) => p.replace(/^"|"$/g, '').trim());
    if (parts.length < 2) continue;

    // First column is the code — must have at least 2 meaningful digits
    const rawCode = parts[0].replace(/-\d$/, '').replace(/\D/g, '');
    if (rawCode.length < 2) continue;
    let code = rawCode.padEnd(8, '0');
    // Normalize to 8-digit format
    code = code.slice(0, 8);

    const description_en = parts[1] || '';
    const description_de = parts.length > 2 ? parts[2] || null : null;
    const description_fr = parts.length > 3 ? parts[3] || null : null;

    if (!description_en) continue;

    codes.push({
      code,
      description_en,
      description_de,
      description_fr,
      parent_code: determineParentCode(code),
      level: determineCpvLevel(code),
    });
  }

  return codes;
}

// ── NUTS Regions ────────────────────────────────────────────────────────────

const NUTS_CSV_URL =
  'https://ec.europa.eu/eurostat/documents/345175/629341/NUTS2021.csv';

export interface NutsRegion {
  code: string;
  name: string;
  level: number;
  country: string;
}

/**
 * Determine NUTS level from code length.
 * Level 0: 2 chars (country), Level 1: 3 chars, Level 2: 4 chars, Level 3: 5 chars
 */
export function determineNutsLevel(code: string): number {
  const len = code.replace(/\s/g, '').length;
  if (len <= 2) return 0;
  if (len === 3) return 1;
  if (len === 4) return 2;
  return 3;
}

/**
 * Parse NUTS regions from CSV content.
 */
export function parseNutsCsv(csvContent: string): NutsRegion[] {
  const lines = csvContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const regions: NutsRegion[] = [];
  const separator = lines[0].includes(';') ? ';' : ',';

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(separator).map((p) => p.replace(/^"|"$/g, '').trim());
    if (parts.length < 2) continue;

    const code = parts[0].trim();
    const name = parts[1].trim();
    if (!code || !name || code.length < 2) continue;

    // Country is first 2 characters of the NUTS code
    const country = code.slice(0, 2);
    const level = determineNutsLevel(code);

    regions.push({ code, name, level, country });
  }

  return regions;
}

// ── Thresholds ──────────────────────────────────────────────────────────────

export interface Threshold {
  directive_short_title: string;
  category: string;
  value_eur: number;
  effective_from: string;
}

export const THRESHOLDS: Threshold[] = [
  // Classic directive 2014/24/EU
  { directive_short_title: '2014/24/EU', category: 'supplies', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/24/EU', category: 'services', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/24/EU', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/24/EU', category: 'social_services', value_eur: 750000, effective_from: '2024-01-01' },
  // Utilities directive 2014/25/EU
  { directive_short_title: '2014/25/EU', category: 'supplies', value_eur: 443000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/25/EU', category: 'services', value_eur: 443000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/25/EU', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
  // Concessions 2014/23/EU
  { directive_short_title: '2014/23/EU', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
  { directive_short_title: '2014/23/EU', category: 'services', value_eur: 5538000, effective_from: '2024-01-01' },
  // Defence 2009/81/EC
  { directive_short_title: '2009/81/EC', category: 'supplies', value_eur: 443000, effective_from: '2024-01-01' },
  { directive_short_title: '2009/81/EC', category: 'services', value_eur: 443000, effective_from: '2024-01-01' },
  { directive_short_title: '2009/81/EC', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
  // Swiss BöB
  { directive_short_title: 'BöB', category: 'supplies', value_eur: 230000, effective_from: '2024-01-01' },
  { directive_short_title: 'BöB', category: 'services', value_eur: 230000, effective_from: '2024-01-01' },
  { directive_short_title: 'BöB', category: 'works', value_eur: 8700000, effective_from: '2024-01-01' },
  // German GWB (above EU thresholds — same values as 2014/24/EU for federal)
  { directive_short_title: 'GWB', category: 'supplies', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: 'GWB', category: 'services', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: 'GWB', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
  // Austrian BVergG (same as EU thresholds for federal procurement)
  { directive_short_title: 'BVergG 2018', category: 'supplies', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: 'BVergG 2018', category: 'services', value_eur: 143000, effective_from: '2024-01-01' },
  { directive_short_title: 'BVergG 2018', category: 'works', value_eur: 5538000, effective_from: '2024-01-01' },
];

// ── Procedure Types ─────────────────────────────────────────────────────────

export interface ProcedureType {
  name: string;
  directive_short_title: string;
  conditions: string;
  time_limits_json: string;
  min_candidates: number | null;
}

export const PROCEDURE_TYPES: ProcedureType[] = [
  // 2014/24/EU — Classic directive
  {
    name: 'Open procedure',
    directive_short_title: '2014/24/EU',
    conditions: 'Default above-threshold procedure. Any interested economic operator may submit a tender.',
    time_limits_json: '{"min_days":35,"accelerated":15}',
    min_candidates: null,
  },
  {
    name: 'Restricted procedure',
    directive_short_title: '2014/24/EU',
    conditions: 'Two-stage with prequalification. Any economic operator may request to participate; only invited candidates submit tenders.',
    time_limits_json: '{"request":30,"tender":30,"accelerated_request":15,"accelerated_tender":10}',
    min_candidates: 5,
  },
  {
    name: 'Competitive dialogue',
    directive_short_title: '2014/24/EU',
    conditions: 'Complex contracts where needs cannot be defined upfront. Authority dialogues with candidates to develop solutions.',
    time_limits_json: '{"request":30}',
    min_candidates: 3,
  },
  {
    name: 'Competitive procedure with negotiation',
    directive_short_title: '2014/24/EU',
    conditions: 'When specifications cannot be established with sufficient precision. Contracting authority negotiates with selected candidates.',
    time_limits_json: '{"request":30,"tender":30}',
    min_candidates: 3,
  },
  {
    name: 'Innovation partnership',
    directive_short_title: '2014/24/EU',
    conditions: 'For developing innovative products/services not available on market. Research and development phase followed by commercial purchase.',
    time_limits_json: '{"request":30}',
    min_candidates: 3,
  },
  {
    name: 'Negotiated without publication',
    directive_short_title: '2014/24/EU',
    conditions: 'Exceptional: no tenders received, extreme urgency, technical reasons, exclusive rights, or repetition of similar services.',
    time_limits_json: '{}',
    min_candidates: null,
  },
  // 2014/25/EU — Utilities directive
  {
    name: 'Open procedure',
    directive_short_title: '2014/25/EU',
    conditions: 'Default procedure for utilities procurement. Any interested economic operator may submit a tender.',
    time_limits_json: '{"min_days":35,"accelerated":15}',
    min_candidates: null,
  },
  {
    name: 'Restricted procedure',
    directive_short_title: '2014/25/EU',
    conditions: 'Two-stage procedure for utilities. Prequalification followed by tender invitation.',
    time_limits_json: '{"request":30,"tender":30}',
    min_candidates: 5,
  },
  {
    name: 'Negotiated procedure with prior call for competition',
    directive_short_title: '2014/25/EU',
    conditions: 'Utilities may use negotiated procedure with prior publication. More flexibility than classic directive.',
    time_limits_json: '{"request":30}',
    min_candidates: 3,
  },
  // Swiss BöB
  {
    name: 'Open procedure (offenes Verfahren)',
    directive_short_title: 'BöB',
    conditions: 'Standard procedure under Swiss procurement law (BöB Art. 21). Public call for tenders.',
    time_limits_json: '{"tender_receipt":40}',
    min_candidates: null,
  },
  {
    name: 'Selective procedure (selektives Verfahren)',
    directive_short_title: 'BöB',
    conditions: 'Two-stage procedure under Swiss procurement law. Prequalification followed by invitation.',
    time_limits_json: '{"request_to_participate":25,"tender_receipt":40}',
    min_candidates: null,
  },
  {
    name: 'Invitation procedure (Einladungsverfahren)',
    directive_short_title: 'BöB',
    conditions: 'Below-threshold procedure. Authority invites at least 3 tenderers without public call.',
    time_limits_json: '{"tender_receipt":25}',
    min_candidates: 3,
  },
  {
    name: 'Direct award (freihändiges Verfahren)',
    directive_short_title: 'BöB',
    conditions: 'Below-threshold or exceptional circumstances. Direct negotiation with one or more providers.',
    time_limits_json: '{}',
    min_candidates: null,
  },
  // German GWB
  {
    name: 'Offenes Verfahren (Open procedure)',
    directive_short_title: 'GWB',
    conditions: 'Default above-threshold procedure under GWB § 119. Public call for tenders.',
    time_limits_json: '{"min_days":35,"accelerated":15}',
    min_candidates: null,
  },
  {
    name: 'Nicht offenes Verfahren (Restricted procedure)',
    directive_short_title: 'GWB',
    conditions: 'Two-stage procedure under GWB § 119. Prequalification followed by tender invitation.',
    time_limits_json: '{"request":30,"tender":30,"accelerated_request":15,"accelerated_tender":10}',
    min_candidates: 5,
  },
  {
    name: 'Verhandlungsverfahren (Negotiated procedure)',
    directive_short_title: 'GWB',
    conditions: 'Negotiated procedure under GWB § 119. Requires justification per VgV § 14.',
    time_limits_json: '{"request":30,"tender":30}',
    min_candidates: 3,
  },
  {
    name: 'Wettbewerblicher Dialog (Competitive dialogue)',
    directive_short_title: 'GWB',
    conditions: 'Complex contracts under GWB § 119. Dialogue phase to develop solutions.',
    time_limits_json: '{"request":30}',
    min_candidates: 3,
  },
  {
    name: 'Innovationspartnerschaft (Innovation partnership)',
    directive_short_title: 'GWB',
    conditions: 'Development of innovative solutions under GWB § 119. Research followed by purchase.',
    time_limits_json: '{"request":30}',
    min_candidates: 3,
  },
  // Austrian BVergG 2018
  {
    name: 'Offenes Verfahren (Open procedure)',
    directive_short_title: 'BVergG 2018',
    conditions: 'Default above-threshold procedure under BVergG 2018. Public call for tenders.',
    time_limits_json: '{"min_days":35,"accelerated":15}',
    min_candidates: null,
  },
  {
    name: 'Nicht offenes Verfahren (Restricted procedure)',
    directive_short_title: 'BVergG 2018',
    conditions: 'Two-stage procedure under BVergG 2018. Prequalification followed by invitation.',
    time_limits_json: '{"request":30,"tender":30}',
    min_candidates: 5,
  },
  {
    name: 'Verhandlungsverfahren (Negotiated procedure)',
    directive_short_title: 'BVergG 2018',
    conditions: 'Negotiated procedure under BVergG 2018. Requires justification.',
    time_limits_json: '{"request":30,"tender":30}',
    min_candidates: 3,
  },
];

// ── Exclusion Grounds ───────────────────────────────────────────────────────

export interface ExclusionGround {
  jurisdiction: string;
  type: 'mandatory' | 'discretionary';
  ground: string;
  article_reference: string;
  description: string;
  directive_short_title: string;
}

export const EXCLUSION_GROUNDS: ExclusionGround[] = [
  // EU — Mandatory (Art. 57(1) of 2014/24/EU)
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Participation in criminal organisation',
    article_reference: 'Art. 57(1)(a)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for participation in a criminal organisation as defined in Article 2 of Council Framework Decision 2008/841/JHA.',
  },
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Corruption',
    article_reference: 'Art. 57(1)(b)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for corruption as defined in Article 3 of the Convention on the fight against corruption involving officials of the European Communities or officials of Member States.',
  },
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Fraud',
    article_reference: 'Art. 57(1)(c)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for fraud within the meaning of Article 1 of the Convention on the protection of the European Communities financial interests.',
  },
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Terrorist offences',
    article_reference: 'Art. 57(1)(d)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for terrorist offences or offences linked to terrorist activities as defined in Articles 1 and 3 of Council Framework Decision 2002/475/JHA.',
  },
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Money laundering or terrorist financing',
    article_reference: 'Art. 57(1)(e)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for money laundering or terrorist financing as defined in Article 1 of Directive 2005/60/EC.',
  },
  {
    jurisdiction: 'EU', type: 'mandatory', ground: 'Child labour and trafficking in human beings',
    article_reference: 'Art. 57(1)(f)', directive_short_title: '2014/24/EU',
    description: 'Conviction by final judgment for child labour and other forms of trafficking in human beings as defined in Article 2 of Directive 2011/36/EU.',
  },
  // EU — Discretionary (Art. 57(4) of 2014/24/EU)
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Violation of environmental, social or labour obligations',
    article_reference: 'Art. 57(4)(a)', directive_short_title: '2014/24/EU',
    description: 'The contracting authority can demonstrate by any appropriate means a violation of applicable obligations referred to in Article 18(2) (environmental, social and labour law).',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Bankruptcy or insolvency',
    article_reference: 'Art. 57(4)(b)', directive_short_title: '2014/24/EU',
    description: 'The economic operator is bankrupt or is the subject of insolvency or winding-up proceedings, where its assets are being administered by a liquidator or by the court.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Grave professional misconduct',
    article_reference: 'Art. 57(4)(c)', directive_short_title: '2014/24/EU',
    description: 'The contracting authority can demonstrate by appropriate means that the economic operator is guilty of grave professional misconduct, which renders its integrity questionable.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Anti-competitive agreements',
    article_reference: 'Art. 57(4)(d)', directive_short_title: '2014/24/EU',
    description: 'The contracting authority has sufficiently plausible indications that the economic operator has entered into agreements with other economic operators aimed at distorting competition.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Conflict of interest',
    article_reference: 'Art. 57(4)(e)', directive_short_title: '2014/24/EU',
    description: 'A conflict of interest within the meaning of Article 24 cannot be effectively remedied by other less intrusive measures.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Prior involvement distorting competition',
    article_reference: 'Art. 57(4)(f)', directive_short_title: '2014/24/EU',
    description: 'A distortion of competition from the prior involvement of the economic operators in the preparation of the procurement procedure cannot be adequately remedied by other, less intrusive measures.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Significant deficiency in prior contract performance',
    article_reference: 'Art. 57(4)(g)', directive_short_title: '2014/24/EU',
    description: 'The economic operator has shown significant or persistent deficiencies in the performance of a substantive requirement under a prior public contract.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Misrepresentation',
    article_reference: 'Art. 57(4)(h)', directive_short_title: '2014/24/EU',
    description: 'The economic operator has been guilty of serious misrepresentation in supplying the information required for verification of the absence of grounds for exclusion or the fulfilment of the selection criteria.',
  },
  {
    jurisdiction: 'EU', type: 'discretionary', ground: 'Undue influence on decision-making',
    article_reference: 'Art. 57(4)(i)', directive_short_title: '2014/24/EU',
    description: 'The economic operator has undertaken to unduly influence the decision-making process of the contracting authority, to obtain confidential information, or has negligently provided misleading information.',
  },
  // Swiss (BöB) exclusion grounds
  {
    jurisdiction: 'CH', type: 'mandatory', ground: 'Corruption and bribery',
    article_reference: 'Art. 44(1)(a) BöB', directive_short_title: 'BöB',
    description: 'Conviction for corruption, bribery, fraud, money laundering, or other serious criminal offences under Swiss or foreign law.',
  },
  {
    jurisdiction: 'CH', type: 'mandatory', ground: 'Non-payment of taxes or social contributions',
    article_reference: 'Art. 44(1)(b) BöB', directive_short_title: 'BöB',
    description: 'Outstanding tax debts or social security contributions that are enforceable.',
  },
  {
    jurisdiction: 'CH', type: 'discretionary', ground: 'Insolvency or bankruptcy',
    article_reference: 'Art. 44(2)(a) BöB', directive_short_title: 'BöB',
    description: 'The tenderer is subject to insolvency, bankruptcy, or debt restructuring proceedings.',
  },
  {
    jurisdiction: 'CH', type: 'discretionary', ground: 'Violation of labour conditions',
    article_reference: 'Art. 44(2)(b) BöB', directive_short_title: 'BöB',
    description: 'Violation of provisions on working conditions, equal pay, or workplace safety.',
  },
  // German (GWB) exclusion grounds
  {
    jurisdiction: 'DE', type: 'mandatory', ground: 'Bestechung (Bribery)',
    article_reference: '§ 123(1) Nr. 1 GWB', directive_short_title: 'GWB',
    description: 'Rechtskräftige Verurteilung wegen Bestechung, Bestechlichkeit oder Vorteilsgewährung.',
  },
  {
    jurisdiction: 'DE', type: 'mandatory', ground: 'Betrug (Fraud)',
    article_reference: '§ 123(1) Nr. 2 GWB', directive_short_title: 'GWB',
    description: 'Rechtskräftige Verurteilung wegen Betrug oder Subventionsbetrug zum Nachteil der EU.',
  },
  {
    jurisdiction: 'DE', type: 'mandatory', ground: 'Terrorismus (Terrorism)',
    article_reference: '§ 123(1) Nr. 3 GWB', directive_short_title: 'GWB',
    description: 'Rechtskräftige Verurteilung wegen Bildung terroristischer Vereinigungen.',
  },
  {
    jurisdiction: 'DE', type: 'mandatory', ground: 'Geldwäsche (Money laundering)',
    article_reference: '§ 123(1) Nr. 4 GWB', directive_short_title: 'GWB',
    description: 'Rechtskräftige Verurteilung wegen Geldwäsche oder Terrorismusfinanzierung.',
  },
  {
    jurisdiction: 'DE', type: 'mandatory', ground: 'Menschenhandel (Trafficking)',
    article_reference: '§ 123(1) Nr. 5 GWB', directive_short_title: 'GWB',
    description: 'Rechtskräftige Verurteilung wegen Menschenhandel oder Zwangsarbeit.',
  },
  {
    jurisdiction: 'DE', type: 'discretionary', ground: 'Insolvenz (Insolvency)',
    article_reference: '§ 124(1) Nr. 2 GWB', directive_short_title: 'GWB',
    description: 'Das Unternehmen befindet sich in einem Insolvenzverfahren oder Liquidation.',
  },
  {
    jurisdiction: 'DE', type: 'discretionary', ground: 'Schwere Verfehlung (Grave misconduct)',
    article_reference: '§ 124(1) Nr. 3 GWB', directive_short_title: 'GWB',
    description: 'Nachweis einer schweren Verfehlung, die die Integrität des Unternehmens in Frage stellt.',
  },
  {
    jurisdiction: 'DE', type: 'discretionary', ground: 'Wettbewerbswidrige Absprachen (Anti-competitive agreements)',
    article_reference: '§ 124(1) Nr. 4 GWB', directive_short_title: 'GWB',
    description: 'Hinreichend begründeter Verdacht auf wettbewerbsbeschränkende Absprachen.',
  },
  // Austrian (BVergG 2018) exclusion grounds
  {
    jurisdiction: 'AT', type: 'mandatory', ground: 'Korruption (Corruption)',
    article_reference: '§ 78(1) Z 1 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Rechtskräftige Verurteilung wegen Bestechung, Korruption oder kriminelle Organisation.',
  },
  {
    jurisdiction: 'AT', type: 'mandatory', ground: 'Betrug (Fraud)',
    article_reference: '§ 78(1) Z 2 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Rechtskräftige Verurteilung wegen Betrug zum Nachteil der EU oder öffentlicher Auftraggeber.',
  },
  {
    jurisdiction: 'AT', type: 'mandatory', ground: 'Terrorismus (Terrorism)',
    article_reference: '§ 78(1) Z 3 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Rechtskräftige Verurteilung wegen terroristischer Straftaten.',
  },
  {
    jurisdiction: 'AT', type: 'mandatory', ground: 'Geldwäsche (Money laundering)',
    article_reference: '§ 78(1) Z 4 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Rechtskräftige Verurteilung wegen Geldwäsche oder Terrorismusfinanzierung.',
  },
  {
    jurisdiction: 'AT', type: 'discretionary', ground: 'Insolvenz (Insolvency)',
    article_reference: '§ 78(2) Z 1 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Der Unternehmer befindet sich in einem Insolvenzverfahren oder Liquidation.',
  },
  {
    jurisdiction: 'AT', type: 'discretionary', ground: 'Schwere berufliche Verfehlung (Grave misconduct)',
    article_reference: '§ 78(2) Z 2 BVergG', directive_short_title: 'BVergG 2018',
    description: 'Nachweis einer schweren beruflichen Verfehlung.',
  },
];

// ── Database insertion helpers ──────────────────────────────────────────────

function resolveDirectiveId(db: DatabaseAdapter, shortTitle: string): number | null {
  const row = db.queryOne<{ id: number }>(
    'SELECT id FROM directives WHERE short_title = ?',
    [shortTitle]
  );
  return row ? row.id : null;
}

function insertCpvCodes(db: DatabaseAdapter, codes: CpvCode[]): number {
  let count = 0;
  for (const code of codes) {
    db.execute(
      `INSERT OR REPLACE INTO cpv_codes (code, description_en, description_de, description_fr, parent_code, level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code.code, code.description_en, code.description_de, code.description_fr, code.parent_code, code.level]
    );
    count++;
  }
  return count;
}

function insertNutsRegions(db: DatabaseAdapter, regions: NutsRegion[]): number {
  let count = 0;
  for (const region of regions) {
    db.execute(
      `INSERT OR REPLACE INTO nuts_regions (code, name, level, country)
       VALUES (?, ?, ?, ?)`,
      [region.code, region.name, region.level, region.country]
    );
    count++;
  }
  return count;
}

function insertThresholds(db: DatabaseAdapter, thresholds: Threshold[]): number {
  let count = 0;
  for (const t of thresholds) {
    const directiveId = resolveDirectiveId(db, t.directive_short_title);

    // Check for existing
    const existing = db.queryOne(
      `SELECT id FROM thresholds WHERE directive_id = ? AND category = ? AND effective_from = ?`,
      [directiveId, t.category, t.effective_from]
    );

    if (existing) {
      db.execute(
        'UPDATE thresholds SET value_eur = ? WHERE directive_id = ? AND category = ? AND effective_from = ?',
        [t.value_eur, directiveId, t.category, t.effective_from]
      );
    } else {
      db.execute(
        `INSERT INTO thresholds (directive_id, category, value_eur, effective_from)
         VALUES (?, ?, ?, ?)`,
        [directiveId, t.category, t.value_eur, t.effective_from]
      );
    }
    count++;
  }
  return count;
}

function insertProcedureTypes(db: DatabaseAdapter, procedures: ProcedureType[]): number {
  let count = 0;
  for (const p of procedures) {
    const directiveId = resolveDirectiveId(db, p.directive_short_title);

    // Check for existing by name + directive
    const existing = db.queryOne(
      'SELECT id FROM procedure_types WHERE name = ? AND directive_id = ?',
      [p.name, directiveId]
    );

    if (existing) {
      db.execute(
        'UPDATE procedure_types SET conditions = ?, time_limits_json = ?, min_candidates = ? WHERE name = ? AND directive_id = ?',
        [p.conditions, p.time_limits_json, p.min_candidates, p.name, directiveId]
      );
    } else {
      db.execute(
        `INSERT INTO procedure_types (name, directive_id, conditions, min_candidates, time_limits_json)
         VALUES (?, ?, ?, ?, ?)`,
        [p.name, directiveId, p.conditions, p.min_candidates, p.time_limits_json]
      );
    }
    count++;
  }
  return count;
}

function insertExclusionGrounds(db: DatabaseAdapter, grounds: ExclusionGround[]): number {
  let count = 0;
  for (const g of grounds) {
    const directiveId = resolveDirectiveId(db, g.directive_short_title);

    // Check for existing by article_reference + jurisdiction
    const existing = db.queryOne(
      'SELECT id FROM exclusion_grounds WHERE article_reference = ? AND jurisdiction = ?',
      [g.article_reference, g.jurisdiction]
    );

    if (existing) {
      db.execute(
        'UPDATE exclusion_grounds SET ground = ?, type = ?, description = ?, directive_id = ? WHERE article_reference = ? AND jurisdiction = ?',
        [g.ground, g.type, g.description, directiveId, g.article_reference, g.jurisdiction]
      );
    } else {
      db.execute(
        `INSERT INTO exclusion_grounds (directive_id, jurisdiction, type, ground, article_reference, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [directiveId, g.jurisdiction, g.type, g.ground, g.article_reference, g.description]
      );
    }
    count++;
  }
  return count;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbPath = getDefaultDbPath();
  console.log(`[ingest-reference] Database: ${dbPath}`);

  const db = await createAdapter(dbPath, { runSchema: true });

  try {
    // ── CPV Codes ───────────────────────────────────────────────
    console.log('\n[CPV] Fetching CPV codes from EU Publications Office...');
    try {
      const cpvResponse = await fetch(CPV_CSV_URL, {
        headers: { 'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)' },
        redirect: 'follow',
      });
      if (cpvResponse.ok) {
        const cpvCsv = await cpvResponse.text();
        const codes = parseCpvCsv(cpvCsv);
        const cpvCount = insertCpvCodes(db, codes);
        console.log(`  -> ${cpvCount} CPV codes ingested`);
      } else {
        console.warn(`  WARNING: CPV fetch returned HTTP ${cpvResponse.status}, skipping`);
      }
    } catch (err) {
      console.error(`  ERROR fetching CPV codes: ${err instanceof Error ? err.message : err}`);
      console.log('  Continuing without CPV codes...');
    }

    // ── NUTS Regions ────────────────────────────────────────────
    console.log('\n[NUTS] Fetching NUTS regions from Eurostat...');
    try {
      const nutsResponse = await fetch(NUTS_CSV_URL, {
        headers: { 'User-Agent': 'AnsvarMCP/1.0 (public-procurement-ingestion)' },
        redirect: 'follow',
      });
      if (nutsResponse.ok) {
        const nutsCsv = await nutsResponse.text();
        const regions = parseNutsCsv(nutsCsv);
        const nutsCount = insertNutsRegions(db, regions);
        console.log(`  -> ${nutsCount} NUTS regions ingested`);
      } else {
        console.warn(`  WARNING: NUTS fetch returned HTTP ${nutsResponse.status}, skipping`);
      }
    } catch (err) {
      console.error(`  ERROR fetching NUTS regions: ${err instanceof Error ? err.message : err}`);
      console.log('  Continuing without NUTS regions...');
    }

    // ── Thresholds ──────────────────────────────────────────────
    console.log('\n[Thresholds] Inserting current threshold values...');
    const thresholdCount = insertThresholds(db, THRESHOLDS);
    console.log(`  -> ${thresholdCount} thresholds inserted`);

    // ── Procedure Types ─────────────────────────────────────────
    console.log('\n[Procedures] Inserting procedure types...');
    const procCount = insertProcedureTypes(db, PROCEDURE_TYPES);
    console.log(`  -> ${procCount} procedure types inserted`);

    // ── Exclusion Grounds ───────────────────────────────────────
    console.log('\n[Exclusion] Inserting exclusion grounds...');
    const exclCount = insertExclusionGrounds(db, EXCLUSION_GROUNDS);
    console.log(`  -> ${exclCount} exclusion grounds inserted`);

    console.log('\n=== Reference data ingestion complete ===');
    console.log(`  CPV codes, NUTS regions, ${thresholdCount} thresholds, ${procCount} procedure types, ${exclCount} exclusion grounds`);
  } finally {
    db.close();
  }
}

// Run if executed directly (not when imported for testing)
const isDirectRun = process.argv[1]?.includes('ingest-reference');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
