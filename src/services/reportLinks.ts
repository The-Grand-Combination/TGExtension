/**
 * The clickable spots of a rendered report. Both reports are plain text, so
 * this reads back what `reportText.ts` wrote: a finding line knows its file
 * only through the lines above it, which is what the scan tracks.
 */

export interface ReportLinkSpan {
  /** 0-based line of the report text. */
  readonly line: number;
  /** 0-based character range inside that line. */
  readonly start: number;
  readonly end: number;
}

export type ReportLinkTarget =
  | {
      readonly kind: 'file';
      readonly root: string;
      readonly relativePath: string;
      /** 1-based, as the report prints them. */
      readonly line: number;
      readonly character: number;
    }
  | {
      readonly kind: 'mapPixel';
      readonly root: string;
      /** The bitmap the finding is about, mod-root-relative. */
      readonly file: string;
      /** 0-based, origin at the top-left corner of the image. */
      readonly x: number;
      readonly y: number;
    };

export interface ReportLink {
  readonly span: ReportLinkSpan;
  readonly target: ReportLinkTarget;
}

const FULL_REPORT_HEADER = 'Victorian Tools - Full report';
const MAP_REPORT_HEADER = 'Victorian Tools - Map report';

/** A mod root is the line a summary follows. */
const SUMMARY = /^\d+ errors?, \d+ warnings? |^No map file of its own/;
const FILE_FINDING = /^ {2}(\d+):(\d+) +(?:error|warning|information|hint) +[\w-]+:/;
const MAP_FINDING = /^ {2}(map\/\S+\.bmp)(?: \((\d+), (\d+)\))? +(?:error|warning|information|hint) +[\w-]+:/;

/** Every link of a report text; empty for anything that is not one. */
export function reportLinks(text: string): ReportLink[] {
  const lines = text.split('\n');
  const header = lines[0];
  if (header !== FULL_REPORT_HEADER && header !== MAP_REPORT_HEADER) {
    return [];
  }
  const links: ReportLink[] = [];
  let root: string | undefined;
  let relativePath: string | undefined;
  lines.forEach((line, index) => {
    if (isRootLine(lines, index)) {
      root = line;
      relativePath = undefined;
      return;
    }
    if (root === undefined || SUMMARY.test(line)) {
      return;
    }
    const link = findingLink(line, index, root, relativePath);
    if (link) {
      links.push(link);
      return;
    }
    if (line !== '' && !line.startsWith(' ')) {
      relativePath = line;
      links.push(fileLink(line, index, root));
    }
  });
  return links;
}

function isRootLine(lines: readonly string[], index: number): boolean {
  const line = lines[index];
  return line !== undefined && line !== '' && !line.startsWith(' ') && SUMMARY.test(lines[index + 1] ?? '');
}

/** The link covers the locator only, from the first non-blank to the code. */
function span(index: number, matched: string): ReportLinkSpan {
  return { line: index, start: matched.length - matched.trimStart().length, end: matched.length - 1 };
}

function findingLink(
  line: string,
  index: number,
  root: string,
  relativePath: string | undefined,
): ReportLink | undefined {
  const map = MAP_FINDING.exec(line);
  if (map) {
    const [matched, file, x, y] = map;
    if (x === undefined || y === undefined || file === undefined) {
      return undefined;
    }
    return { span: span(index, matched), target: { kind: 'mapPixel', root, file, x: Number(x), y: Number(y) } };
  }
  const finding = FILE_FINDING.exec(line);
  if (!finding || relativePath === undefined) {
    return undefined;
  }
  const [matched, targetLine, character] = finding;
  return {
    span: span(index, matched),
    target: { kind: 'file', root, relativePath, line: Number(targetLine), character: Number(character) },
  };
}

function fileLink(line: string, index: number, root: string): ReportLink {
  return {
    span: { line: index, start: 0, end: line.length },
    target: { kind: 'file', root, relativePath: line, line: 1, character: 1 },
  };
}
