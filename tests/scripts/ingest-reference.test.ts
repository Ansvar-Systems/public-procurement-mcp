/**
 * Tests for the reference data ingestion pipeline.
 *
 * Tests CPV code parsing, NUTS region parsing, and validates
 * completeness of threshold and exclusion ground data.
 */

import { describe, it, expect } from 'vitest';
import {
  determineCpvLevel,
  determineParentCode,
  parseCpvCsv,
  determineNutsLevel,
  parseNutsCsv,
  THRESHOLDS,
  PROCEDURE_TYPES,
  EXCLUSION_GROUNDS,
} from '../../scripts/ingest-reference.js';

// ── CPV Code Tests ──────────────────────────────────────────────────────────

describe('CPV Code Parser', () => {
  describe('determineCpvLevel', () => {
    it('should identify division level (2 digits)', () => {
      expect(determineCpvLevel('45000000')).toBe(1);
      expect(determineCpvLevel('72000000')).toBe(1);
    });

    it('should identify group level (3 digits)', () => {
      expect(determineCpvLevel('45200000')).toBe(2);
      expect(determineCpvLevel('72200000')).toBe(2);
    });

    it('should identify class level (4 digits)', () => {
      expect(determineCpvLevel('45210000')).toBe(3);
      expect(determineCpvLevel('72210000')).toBe(3);
    });

    it('should identify category level (5 digits)', () => {
      expect(determineCpvLevel('45211000')).toBe(4);
    });

    it('should handle codes with check digit', () => {
      expect(determineCpvLevel('45000000-7')).toBe(1);
      expect(determineCpvLevel('72200000-7')).toBe(2);
    });
  });

  describe('determineParentCode', () => {
    it('should return null for division level', () => {
      expect(determineParentCode('45000000')).toBeNull();
      expect(determineParentCode('72000000')).toBeNull();
    });

    it('should return division for group level', () => {
      expect(determineParentCode('45200000')).toBe('45000000');
      expect(determineParentCode('72200000')).toBe('72000000');
    });

    it('should return group for class level', () => {
      expect(determineParentCode('45210000')).toBe('45200000');
      expect(determineParentCode('72210000')).toBe('72200000');
    });

    it('should return class for category level', () => {
      expect(determineParentCode('45211000')).toBe('45210000');
    });
  });

  describe('parseCpvCsv', () => {
    it('should parse semicolon-separated CSV', () => {
      const csv = `Code;EN;DE;FR
45000000;Construction work;Bauarbeiten;Travaux de construction
45200000;Works for complete or part construction;Komplett- oder Teilbauleistungen;Travaux de construction complete
72000000;IT services;IT-Dienste;Services de technologies`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(3);

      const construction = codes.find((c) => c.code === '45000000');
      expect(construction).toBeDefined();
      expect(construction!.description_en).toBe('Construction work');
      expect(construction!.description_de).toBe('Bauarbeiten');
      expect(construction!.description_fr).toBe('Travaux de construction');
      expect(construction!.level).toBe(1);
      expect(construction!.parent_code).toBeNull();

      const works = codes.find((c) => c.code === '45200000');
      expect(works).toBeDefined();
      expect(works!.level).toBe(2);
      expect(works!.parent_code).toBe('45000000');
    });

    it('should parse comma-separated CSV', () => {
      const csv = `Code,EN,DE,FR
48000000,Software package and information systems,Softwarepaket,Logiciels
48100000,Industry specific software,Branchenspezifisch,Progiciels`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(2);
    });

    it('should handle quoted fields', () => {
      const csv = `Code;EN;DE;FR
"79000000";"Business services: law, marketing";"Unternehmens- und Managementberatung";"Services aux entreprises"`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(1);
      expect(codes[0].description_en).toContain('Business services');
    });

    it('should handle empty CSV', () => {
      const codes = parseCpvCsv('');
      expect(codes).toEqual([]);
    });

    it('should handle CSV with only header', () => {
      const codes = parseCpvCsv('Code;EN;DE;FR');
      expect(codes).toEqual([]);
    });

    it('should skip rows with missing code or description', () => {
      const csv = `Code;EN
;Missing code
X;Not a number
45000000;Construction work`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(1);
      expect(codes[0].code).toBe('45000000');
    });

    it('should pad short numeric codes to 8 digits', () => {
      const csv = `Code;EN
12;Short code padded`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(1);
      expect(codes[0].code).toBe('12000000');
      expect(codes[0].level).toBe(1);
    });

    it('should set hierarchy correctly for all levels', () => {
      const csv = `Code;EN
45000000;Division
45200000;Group
45210000;Class
45211000;Category
45211100;Subcategory`;

      const codes = parseCpvCsv(csv);
      expect(codes.length).toBe(5);

      expect(codes[0].level).toBe(1);
      expect(codes[1].level).toBe(2);
      expect(codes[2].level).toBe(3);
      expect(codes[3].level).toBe(4);
      expect(codes[4].level).toBe(5);
    });
  });
});

// ── NUTS Region Tests ───────────────────────────────────────────────────────

describe('NUTS Region Parser', () => {
  describe('determineNutsLevel', () => {
    it('should identify country level (0)', () => {
      expect(determineNutsLevel('DE')).toBe(0);
      expect(determineNutsLevel('AT')).toBe(0);
    });

    it('should identify level 1', () => {
      expect(determineNutsLevel('DE1')).toBe(1);
      expect(determineNutsLevel('AT1')).toBe(1);
    });

    it('should identify level 2', () => {
      expect(determineNutsLevel('DE11')).toBe(2);
      expect(determineNutsLevel('AT13')).toBe(2);
    });

    it('should identify level 3', () => {
      expect(determineNutsLevel('DE111')).toBe(3);
      expect(determineNutsLevel('AT130')).toBe(3);
    });
  });

  describe('parseNutsCsv', () => {
    it('should parse NUTS regions from CSV', () => {
      const csv = `Code;Name
DE;Germany
DE1;Baden-Württemberg
DE11;Stuttgart
DE111;Stuttgart, Stadtkreis
AT;Austria
AT1;Ostösterreich
AT13;Wien`;

      const regions = parseNutsCsv(csv);
      expect(regions.length).toBe(7);

      const germany = regions.find((r) => r.code === 'DE');
      expect(germany).toBeDefined();
      expect(germany!.name).toBe('Germany');
      expect(germany!.level).toBe(0);
      expect(germany!.country).toBe('DE');

      const stuttgart = regions.find((r) => r.code === 'DE11');
      expect(stuttgart).toBeDefined();
      expect(stuttgart!.level).toBe(2);
      expect(stuttgart!.country).toBe('DE');

      const wien = regions.find((r) => r.code === 'AT13');
      expect(wien).toBeDefined();
      expect(wien!.level).toBe(2);
      expect(wien!.country).toBe('AT');
    });

    it('should handle comma-separated CSV', () => {
      const csv = `Code,Name
CH,Switzerland
CH01,Région lémanique`;

      const regions = parseNutsCsv(csv);
      expect(regions.length).toBe(2);
      expect(regions[0].country).toBe('CH');
    });

    it('should handle empty CSV', () => {
      expect(parseNutsCsv('')).toEqual([]);
    });

    it('should skip invalid entries', () => {
      const csv = `Code;Name
;Missing code
D;Too short
DE;Germany`;

      const regions = parseNutsCsv(csv);
      expect(regions.length).toBe(1);
      expect(regions[0].code).toBe('DE');
    });
  });
});

// ── Threshold Data Completeness ─────────────────────────────────────────────

describe('Threshold Data', () => {
  it('should cover all main procurement categories', () => {
    const categories = [...new Set(THRESHOLDS.map((t) => t.category))];
    expect(categories).toContain('supplies');
    expect(categories).toContain('services');
    expect(categories).toContain('works');
  });

  it('should cover all major directives', () => {
    const directives = [...new Set(THRESHOLDS.map((t) => t.directive_short_title))];
    expect(directives).toContain('2014/24/EU');
    expect(directives).toContain('2014/25/EU');
    expect(directives).toContain('2014/23/EU');
    expect(directives).toContain('BöB');
    expect(directives).toContain('GWB');
    expect(directives).toContain('BVergG 2018');
  });

  it('should have reasonable threshold values', () => {
    for (const t of THRESHOLDS) {
      expect(t.value_eur).toBeGreaterThan(0);
      expect(t.value_eur).toBeLessThan(100000000);
    }
  });

  it('should have valid effective_from dates', () => {
    for (const t of THRESHOLDS) {
      expect(t.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('should have 2014/24/EU supplies at 143000', () => {
    const t = THRESHOLDS.find(
      (t) => t.directive_short_title === '2014/24/EU' && t.category === 'supplies'
    );
    expect(t).toBeDefined();
    expect(t!.value_eur).toBe(143000);
  });

  it('should have works threshold at 5538000 for classic directive', () => {
    const t = THRESHOLDS.find(
      (t) => t.directive_short_title === '2014/24/EU' && t.category === 'works'
    );
    expect(t).toBeDefined();
    expect(t!.value_eur).toBe(5538000);
  });

  it('should have higher utilities thresholds than classic', () => {
    const classicSupplies = THRESHOLDS.find(
      (t) => t.directive_short_title === '2014/24/EU' && t.category === 'supplies'
    );
    const utilitiesSupplies = THRESHOLDS.find(
      (t) => t.directive_short_title === '2014/25/EU' && t.category === 'supplies'
    );
    expect(classicSupplies).toBeDefined();
    expect(utilitiesSupplies).toBeDefined();
    expect(utilitiesSupplies!.value_eur).toBeGreaterThan(classicSupplies!.value_eur);
  });

  it('should have social_services category for classic directive', () => {
    const t = THRESHOLDS.find(
      (t) => t.directive_short_title === '2014/24/EU' && t.category === 'social_services'
    );
    expect(t).toBeDefined();
    expect(t!.value_eur).toBe(750000);
  });
});

// ── Procedure Type Data ─────────────────────────────────────────────────────

describe('Procedure Type Data', () => {
  it('should cover all major directives', () => {
    const directives = [...new Set(PROCEDURE_TYPES.map((p) => p.directive_short_title))];
    expect(directives).toContain('2014/24/EU');
    expect(directives).toContain('2014/25/EU');
    expect(directives).toContain('BöB');
    expect(directives).toContain('GWB');
    expect(directives).toContain('BVergG 2018');
  });

  it('should have open procedure for all directives', () => {
    const directives = [...new Set(PROCEDURE_TYPES.map((p) => p.directive_short_title))];
    for (const d of directives) {
      const hasOpen = PROCEDURE_TYPES.some(
        (p) => p.directive_short_title === d && p.name.toLowerCase().includes('open')
      );
      expect(hasOpen, `Missing open procedure for ${d}`).toBe(true);
    }
  });

  it('should have valid time_limits_json', () => {
    for (const p of PROCEDURE_TYPES) {
      const parsed = JSON.parse(p.time_limits_json);
      expect(typeof parsed).toBe('object');
    }
  });

  it('should have min_candidates >= 3 for competitive procedures', () => {
    const competitive = PROCEDURE_TYPES.filter(
      (p) => p.min_candidates !== null && p.name.toLowerCase().includes('competitive')
    );
    for (const p of competitive) {
      expect(p.min_candidates).toBeGreaterThanOrEqual(3);
    }
  });

  it('should have at least 6 procedure types for classic directive', () => {
    const classic = PROCEDURE_TYPES.filter((p) => p.directive_short_title === '2014/24/EU');
    expect(classic.length).toBeGreaterThanOrEqual(6);
  });
});

// ── Exclusion Ground Data ───────────────────────────────────────────────────

describe('Exclusion Ground Data', () => {
  it('should cover EU, CH, DE, AT jurisdictions', () => {
    const jurisdictions = [...new Set(EXCLUSION_GROUNDS.map((g) => g.jurisdiction))];
    expect(jurisdictions).toContain('EU');
    expect(jurisdictions).toContain('CH');
    expect(jurisdictions).toContain('DE');
    expect(jurisdictions).toContain('AT');
  });

  it('should have both mandatory and discretionary grounds for EU', () => {
    const euMandatory = EXCLUSION_GROUNDS.filter(
      (g) => g.jurisdiction === 'EU' && g.type === 'mandatory'
    );
    const euDiscretionary = EXCLUSION_GROUNDS.filter(
      (g) => g.jurisdiction === 'EU' && g.type === 'discretionary'
    );
    expect(euMandatory.length).toBeGreaterThanOrEqual(6);
    expect(euDiscretionary.length).toBeGreaterThanOrEqual(9);
  });

  it('should have all 6 mandatory EU grounds from Art. 57(1)', () => {
    const mandatory = EXCLUSION_GROUNDS.filter(
      (g) => g.jurisdiction === 'EU' && g.type === 'mandatory'
    );
    const grounds = mandatory.map((g) => g.ground.toLowerCase());
    expect(grounds.some((g) => g.includes('criminal organisation'))).toBe(true);
    expect(grounds.some((g) => g.includes('corruption'))).toBe(true);
    expect(grounds.some((g) => g.includes('fraud'))).toBe(true);
    expect(grounds.some((g) => g.includes('terrorist'))).toBe(true);
    expect(grounds.some((g) => g.includes('money laundering'))).toBe(true);
    expect(grounds.some((g) => g.includes('child labour') || g.includes('trafficking'))).toBe(true);
  });

  it('should have article references for all grounds', () => {
    for (const g of EXCLUSION_GROUNDS) {
      expect(g.article_reference).toBeTruthy();
      expect(g.article_reference.length).toBeGreaterThan(3);
    }
  });

  it('should have descriptions for all grounds', () => {
    for (const g of EXCLUSION_GROUNDS) {
      expect(g.description).toBeTruthy();
      expect(g.description.length).toBeGreaterThan(10);
    }
  });

  it('should have directive references for all grounds', () => {
    for (const g of EXCLUSION_GROUNDS) {
      expect(g.directive_short_title).toBeTruthy();
    }
  });

  it('should have mandatory grounds for DE and AT', () => {
    const deMandatory = EXCLUSION_GROUNDS.filter(
      (g) => g.jurisdiction === 'DE' && g.type === 'mandatory'
    );
    const atMandatory = EXCLUSION_GROUNDS.filter(
      (g) => g.jurisdiction === 'AT' && g.type === 'mandatory'
    );
    expect(deMandatory.length).toBeGreaterThanOrEqual(4);
    expect(atMandatory.length).toBeGreaterThanOrEqual(3);
  });

  it('should have corruption-related grounds in every jurisdiction', () => {
    const jurisdictions = [...new Set(EXCLUSION_GROUNDS.map((g) => g.jurisdiction))];
    for (const j of jurisdictions) {
      const hasCorruption = EXCLUSION_GROUNDS.some(
        (g) => g.jurisdiction === j && g.ground.toLowerCase().includes('corruption') ||
              g.jurisdiction === j && g.ground.toLowerCase().includes('korruption') ||
              g.jurisdiction === j && g.ground.toLowerCase().includes('bestechung')
      );
      expect(hasCorruption, `Missing corruption ground for ${j}`).toBe(true);
    }
  });
});
