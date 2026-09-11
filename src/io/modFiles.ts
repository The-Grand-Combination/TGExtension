import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

/**
 * File access for Victoria 2 mod folders. Wraps `node:fs` so services stay
 * pure; identifiers are ASCII, so latin1 decoding is sufficient for the
 * windows-1252 files the game uses.
 */

/** Walk up from a file or folder until a directory containing `common/` is found. */
export function findModRoot(startPath: string): string | undefined {
  let current = path.resolve(startPath);
  for (;;) {
    if (isDirectory(path.join(current, 'common'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

export function readModFile(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'latin1');
  } catch {
    return undefined;
  }
}

/** `readModFile` for callers that read many files at once; reads run on the thread pool. */
export async function readModFileAsync(filePath: string): Promise<string | undefined> {
  try {
    return await fsPromises.readFile(filePath, 'latin1');
  } catch {
    return undefined;
  }
}

export function readModFileBytes(filePath: string): Uint8Array | undefined {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return undefined;
  }
}

/** `readModFileBytes` for large files (map bitmaps); the read runs on the thread pool. */
export async function readModFileBytesAsync(filePath: string): Promise<Uint8Array | undefined> {
  try {
    return await fsPromises.readFile(filePath);
  } catch {
    return undefined;
  }
}

/** Overwrite a file in place; false when the write fails. */
export async function writeModFileBytes(filePath: string, bytes: Uint8Array): Promise<boolean> {
  try {
    await fsPromises.writeFile(filePath, bytes);
    return true;
  } catch {
    return false;
  }
}

/** Write a text file in the game's windows-1252 encoding, creating its folders; false when the write fails. */
export async function writeModFileText(filePath: string, text: string): Promise<boolean> {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, text, 'latin1');
    return true;
  } catch {
    return false;
  }
}

/** Move a file; false when the source is missing, the target exists, or the move fails. */
export async function renameModFile(fromPath: string, toPath: string): Promise<boolean> {
  if (!fileExists(fromPath) || fileExists(toPath)) {
    return false;
  }
  try {
    await fsPromises.rename(fromPath, toPath);
    return true;
  } catch {
    return false;
  }
}

/** Every file under a folder, recursively, as forward-slash paths relative to `rootPath`. */
export function listFilesRecursive(rootPath: string, relativeFolder: string): string[] {
  const found: string[] = [];
  const visit = (relativeDirectory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(rootPath, relativeDirectory), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (entry.isFile()) {
        found.push(relativePath);
      }
    }
  };
  visit(relativeFolder);
  return found;
}

/** List file names (not paths) with the given extension directly inside a folder. */
export function listFiles(directoryPath: string, extension: string): string[] {
  try {
    return fs
      .readdirSync(directoryPath)
      .filter((name) => name.toLowerCase().endsWith(extension.toLowerCase()));
  } catch {
    return [];
  }
}
