import * as assert from 'node:assert';
import { VANILLA_POPS, VANILLA_POPS_DATES } from '../../data/vanillaPops.js';
import { auditPops, popsDiagnostics, type PopsAudit } from '../../services/popsValidation.js';

const START = '1836.1.1';
const SECOND = '1861.4.14';

function pathsFor(date: string, names: readonly string[] = VANILLA_POPS[date] ?? []): string[] {
  return names.map((name) => `history/pops/${date}/${name}`);
}

const WHOLE_START_SET = pathsFor(START);

function missing(audit: PopsAudit, date: string): readonly string[] {
  return audit.missingByDate.get(date) ?? [];
}

suite('vanillaPops — the stored list', () => {
  test('it holds both date folders the base game ships', () => {
    assert.deepStrictEqual([...VANILLA_POPS_DATES], [START, SECOND]);
  });

  test('179 files in each, the same names in both', () => {
    assert.strictEqual(VANILLA_POPS[START]?.length, 179);
    assert.strictEqual(VANILLA_POPS[SECOND]?.length, 179);
    assert.deepStrictEqual(VANILLA_POPS[START], VANILLA_POPS[SECOND]);
  });
});

suite('popsValidation', () => {
  test('the whole set present reports nothing', () => {
    const audit = auditPops(WHOLE_START_SET);
    assert.strictEqual(audit.missingByDate.size, 0);
    assert.deepStrictEqual(popsDiagnostics(audit, { start: 0, end: 1 }), []);
  });

  test('a mod that adds files of its own alongside them is fine', () => {
    const audit = auditPops([...WHOLE_START_SET, 'history/pops/1836.1.1/Ilias.txt']);
    assert.strictEqual(audit.missingByDate.size, 0);
  });

  test('one dropped file is an error naming it', () => {
    const audit = auditPops(WHOLE_START_SET.filter((filePath) => !filePath.endsWith('/Austria.txt')));
    assert.deepStrictEqual(missing(audit, START), ['Austria.txt']);
    const [finding] = popsDiagnostics(audit, { start: 5, end: 9 });
    assert.strictEqual(finding?.code, 'missing-pops-file');
    assert.strictEqual(finding.severity, 'error');
    assert.match(finding.message, /1 of the 179 pops files the base game ships for 1836\.1\.1 is not in the stack: Austria\.txt/);
    assert.deepStrictEqual(finding.range, { start: 5, end: 9 });
  });

  test('many dropped files are counted, with a handful named', () => {
    const audit = auditPops(pathsFor(START, (VANILLA_POPS[START] ?? []).slice(0, 4)));
    assert.strictEqual(missing(audit, START).length, 175);
    const [finding] = popsDiagnostics(audit, { start: 0, end: 1 });
    assert.match(finding?.message ?? '', /175 of the 179 pops files/);
    assert.match(finding?.message ?? '', /and 169 more/);
    assert.match(finding?.message ?? '', /an empty file is enough/);
  });

  test('a date folder the stack does not have at all is not judged', () => {
    // The base game ships pops for a second bookmark; a mod with one bookmark drops it and runs.
    const audit = auditPops(WHOLE_START_SET);
    assert.deepStrictEqual(missing(audit, SECOND), []);
    assert.strictEqual(audit.missingByDate.has(SECOND), false);
  });

  test('a date folder the stack has must be complete, second bookmark included', () => {
    const audit = auditPops([...WHOLE_START_SET, `history/pops/${SECOND}/Austria.txt`]);
    assert.strictEqual(missing(audit, SECOND).length, 178);
    assert.strictEqual(popsDiagnostics(audit, { start: 0, end: 1 }).length, 1);
  });

  test('each date folder gets its own finding', () => {
    const audit = auditPops([
      ...pathsFor(START, (VANILLA_POPS[START] ?? []).slice(0, 10)),
      ...pathsFor(SECOND, (VANILLA_POPS[SECOND] ?? []).slice(0, 10)),
    ]);
    const findings = popsDiagnostics(audit, { start: 0, end: 1 });
    assert.strictEqual(findings.length, 2);
    assert.match(findings[0]?.message ?? '', /for 1836\.1\.1/);
    assert.match(findings[1]?.message ?? '', /for 1861\.4\.14/);
  });

  test('a folder of the mod\'s own date is none of the check\'s business', () => {
    const audit = auditPops([...WHOLE_START_SET, 'history/pops/2954.1.1/Ilias.txt']);
    assert.strictEqual(audit.missingByDate.size, 0);
  });

  test('a name is matched however it is cased on disk', () => {
    const renamed = WHOLE_START_SET.map((filePath) =>
      filePath.endsWith('/Austria.txt') ? 'history/pops/1836.1.1/AUSTRIA.TXT' : filePath,
    );
    assert.strictEqual(auditPops(renamed).missingByDate.size, 0);
  });

  test('a file one folder deeper is not the file the engine reads', () => {
    const nested = WHOLE_START_SET.map((filePath) =>
      filePath.endsWith('/Austria.txt') ? 'history/pops/1836.1.1/extra/Austria.txt' : filePath,
    );
    assert.deepStrictEqual(missing(auditPops(nested), START), ['Austria.txt']);
  });

  test('no pops anywhere in the stack is not judged: there is no folder to be incomplete', () => {
    assert.strictEqual(auditPops([]).missingByDate.size, 0);
  });
});
