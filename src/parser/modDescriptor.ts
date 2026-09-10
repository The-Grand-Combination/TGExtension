import * as path from 'node:path';
import type { Entry } from '../model/ast.js';
import { findByKey, scalarValueOf } from '../model/astQuery.js';
import type { ModDescriptor } from '../model/modDescriptor.js';
import { tokenize } from './lexer.js';
import { parse } from './parser.js';

/**
 * Read a `.mod` descriptor. `path` is required; without it the launcher loads
 * nothing for the mod, so neither do we. The name falls back to the file name.
 * The mod folder is `path` without its leading `mod/`, next to the descriptor:
 * `<game>/mod/TGC.mod` → `<game>/mod/TGC`, and a checkout that mirrors the
 * `mod/` folder (`<repo>/GFM.mod` → `<repo>/GFM`) resolves the same way.
 */
export function parseModDescriptor(text: string, descriptorPath: string): ModDescriptor | undefined {
  const lex = tokenize(text);
  const { entries } = parse(lex.tokens, text.length, lex.diagnostics).document;
  const modPath = scalarValueOf(entries, 'path');
  if (modPath === undefined || modPath.trim() === '') {
    return undefined;
  }
  const normalizedPath = normalizeRelative(modPath);
  const userDir = scalarValueOf(entries, 'user_dir');
  return {
    name: scalarValueOf(entries, 'name') ?? fileStem(descriptorPath),
    path: normalizedPath,
    folder: path.join(path.dirname(descriptorPath), ...normalizedPath.replace(/^mod\//i, '').split('/')),
    ...(userDir === undefined ? {} : { userDir }),
    replacePaths: findByKey(entries, 'replace_path')
      .map((assignment) => (assignment.value.kind === 'scalar' ? normalizeRelative(assignment.value.value) : ''))
      .filter((value) => value !== ''),
    dependencies: dependencyNames(entries),
    descriptorPath,
  };
}

function dependencyNames(entries: readonly Entry[]): string[] {
  const names: string[] = [];
  for (const assignment of findByKey(entries, 'dependencies')) {
    if (assignment.value.kind !== 'block') {
      continue;
    }
    for (const item of assignment.value.entries) {
      if (item.kind === 'scalar') {
        names.push(item.value);
      }
    }
  }
  return names;
}

/** Forward slashes, no leading `./` or `/`, no trailing slash. */
function normalizeRelative(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .replace(/\/+$/, '');
}

function fileStem(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  return base.replace(/\.mod$/i, '');
}
