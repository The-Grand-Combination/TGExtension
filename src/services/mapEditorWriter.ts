import * as path from 'node:path';
import { unrepresentableIn, type Codepage } from '../io/textCodec.js';
import { isInsideRoot } from './modLayout.js';

/** What writing into a mod needs of the host; `MapEditorHost` provides it. */
export interface WriterHost {
  readonly writeText: (absolutePath: string, text: string) => Promise<boolean>;
  readonly writeBytes: (absolutePath: string, bytes: Uint8Array) => Promise<boolean>;
  readonly rename: (fromPath: string, toPath: string) => Promise<boolean>;
  /** The mod's code page, asked at save time so the setting can change meanwhile. */
  readonly codepage: () => Codepage;
}

/** Every write the Map Editor makes into a mod: only inside the target, and never two saves at once per root. */
export class MapEditorWriter {
  /** The tail of the work queued for each mod root. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly host: WriterHost) {}

  /** Run `work` once every earlier call for the root has settled. */
  serialized<T>(root: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(root) ?? Promise.resolve();
    const run = previous.then(work, work);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(root, settled);
    void settled.then(() => {
      if (this.queues.get(root) === settled) {
        this.queues.delete(root);
      }
    });
    return run;
  }

  /** Where a file is written: itself when it is already the target's, else the same path under the target. */
  destinationFor(root: string, source: string | undefined, relativePath: string): string {
    return source !== undefined && isInsideRoot(root, source) ? source : path.join(root, relativePath);
  }

  /** The message for a character the mod's code page cannot store, or undefined when it can store them all. */
  codepageReason(text: string): string | undefined {
    const codepage = this.host.codepage();
    const stray = unrepresentableIn(text, codepage);
    return stray === undefined
      ? undefined
      : `'${stray}' cannot be stored in ${codepage}; the game reads this mod one byte per character.`;
  }

  /** Write, or the reason it could not; a dry run stops after the code page check. */
  async writeText(absolutePath: string, text: string, subject: string, dryRun = false): Promise<string | undefined> {
    const stray = this.codepageReason(text);
    if (stray !== undefined) {
      return stray;
    }
    if (dryRun) {
      return undefined;
    }
    return (await this.host.writeText(absolutePath, text)) ? undefined : `${subject} could not be written.`;
  }

  writeTextPlain(absolutePath: string, text: string): Promise<boolean> {
    return this.host.writeText(absolutePath, text);
  }

  writeBytes(absolutePath: string, bytes: Uint8Array): Promise<boolean> {
    return this.host.writeBytes(absolutePath, bytes);
  }

  rename(fromPath: string, toPath: string): Promise<boolean> {
    return this.host.rename(fromPath, toPath);
  }
}
