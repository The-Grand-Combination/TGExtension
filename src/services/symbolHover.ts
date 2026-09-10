import { KEYWORD_DOCS, SCOPE_CHANGERS } from '../data/scopes.js';
import { EFFECTS } from '../data/effects.js';
import { TRIGGERS } from '../data/triggers.js';
import type { Range } from '../model/range.js';
import type { ArgKind, ArgSpec, BlockArgSpec, ScopeChangerDef, SymbolDef } from '../model/symbols.js';
import { tokenize } from '../parser/lexer.js';

const PLACEHOLDERS: Readonly<Partial<Record<ArgKind, string>>> = {
  number: 'n',
  yesno: 'yes/no',
  string: '"text"',
  flag: '<flag>',
  variable: '<variable>',
  strata: 'poor/middle/rich',
  identifier: '<name>',
  block: '{ ... }',
  event: '<event id>',
  country: 'TAG',
  culture: '<culture>',
  cultureGroup: '<culture group>',
  religion: '<religion>',
  good: '<good>',
  ideology: '<ideology>',
  government: '<government>',
  building: '<building>',
  modifier: '<modifier>',
  nationalValue: '<national value>',
  cbType: '<cb type>',
  crime: '<crime>',
  popType: '<pop type>',
  rebelType: '<rebel type>',
  graphicalCulture: '<graphical culture>',
  date: 'yyyy.m.d',
  province: '<province id>',
  stateRegion: '<state>',
  continent: '<continent>',
  terrain: '<terrain>',
  technology: '<tech>',
  invention: '<invention>',
  reformClass: '<reform>',
  reformOption: '<reform option>',
  issue: '<issue>',
  unit: '<unit>',
  trait: '<trait>',
};

function placeholderFor(accepts: readonly ArgKind[]): string {
  return accepts.map((kind) => PLACEHOLDERS[kind] ?? `<${kind}>`).join(' | ');
}

function blockSyntax(name: string, spec: BlockArgSpec): string {
  const fields = Object.entries(spec.fields).map(([fieldName, fieldSpec]) => {
    const rendered = `${fieldName} = ${placeholderFor(fieldSpec.accepts)}`;
    return fieldSpec.required ? rendered : `[${rendered}]`;
  });
  const inner = [...fields, ...(spec.open === true ? ['...'] : [])].join(' ');
  return `${name} = { ${inner} }`;
}

/** Render usage syntax for a symbol from its argument specification. */
export function syntaxFor(name: string, arg: ArgSpec): string {
  if (arg.kind === 'scalar') {
    return `${name} = ${placeholderFor(arg.accepts)}`;
  }
  if (arg.kind === 'block') {
    return blockSyntax(name, arg);
  }
  return `${name} = ${placeholderFor(arg.scalar.accepts)}  or  ${blockSyntax(name, arg.block)}`;
}

function producesLabel(produces: ScopeChangerDef['produces']): string {
  if (typeof produces === 'string') {
    return produces;
  }
  return Object.entries(produces)
    .map(([fromScope, toScope]) => `${toScope} (from ${fromScope})`)
    .join(' / ');
}

function symbolSection(name: string, kind: 'trigger' | 'effect', definition: SymbolDef): string {
  return [
    `**${name}** _(${kind})_ — ${definition.doc}`,
    '',
    '```victoria2',
    syntaxFor(name, definition.arg),
    '```',
    `Valid in: ${definition.scopes.join(', ')} scope`,
  ].join('\n');
}

/** Markdown hover for a known trigger/effect/scope/keyword, or undefined. */
export function symbolHoverMarkdown(nameRaw: string): string | undefined {
  const name = nameRaw.toLowerCase();
  const sections: string[] = [];

  const trigger = TRIGGERS[name];
  if (trigger) {
    sections.push(symbolSection(name, 'trigger', trigger));
  }
  const effect = EFFECTS[name];
  if (effect) {
    sections.push(symbolSection(name, 'effect', effect));
  }
  const scope = SCOPE_CHANGERS[name];
  if (scope) {
    sections.push(
      `**${name}** _(scope)_ — ${scope.doc}\n\nProduces ${producesLabel(scope.produces)} scope · from ${scope.from.join(', ')} · ${scope.contexts === 'both' ? 'triggers and effects' : `${scope.contexts}s only`}`,
    );
  }
  if (sections.length === 0) {
    const keyword = KEYWORD_DOCS[name];
    if (keyword !== undefined) {
      sections.push(`**${name}** — ${keyword}`);
    }
  }
  return sections.length > 0 ? sections.join('\n\n---\n\n') : undefined;
}

export interface KeyTokenAt {
  readonly name: string;
  readonly tokenRange: Range;
}

/** The word under the cursor, only if it is in key position (followed by an operator). */
export function resolveKeyAt(text: string, offset: number): KeyTokenAt | undefined {
  const { tokens } = tokenize(text);
  const index = tokens.findIndex(
    (candidate) =>
      candidate.kind === 'word' && candidate.range.start <= offset && offset <= candidate.range.end,
  );
  if (index < 0) {
    return undefined;
  }
  const next = tokens[index + 1];
  if (!next || (next.kind !== 'equals' && next.kind !== 'lt' && next.kind !== 'gt' && next.kind !== 'le' && next.kind !== 'ge')) {
    return undefined;
  }
  const token = tokens[index];
  return token ? { name: token.value, tokenRange: token.range } : undefined;
}
