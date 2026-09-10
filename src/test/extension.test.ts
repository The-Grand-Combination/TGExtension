import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'sparta.victorian-tools';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function codeToString(code: vscode.Diagnostic['code']): string {
  if (typeof code === 'object') {
    return String(code.value);
  }
  return String(code);
}

async function waitForDiagnostics(
  uri: vscode.Uri,
  timeoutMs: number,
): Promise<readonly vscode.Diagnostic[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = vscode.languages.getDiagnostics(uri);
    if (found.length > 0) {
      return found;
    }
    await delay(200);
  }
  return vscode.languages.getDiagnostics(uri);
}

suite('Victorian Tools — integration', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} should be installed`);
    await extension.activate();
  });

  test('registers the restart command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('victorian-tools.restartServer'));
  });

  test('registers the side bar commands and contributes the side bar view', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('victorian-tools.generateFullReport'));
    assert.ok(commands.includes('victorian-tools.generateMapReport'));
    assert.ok(commands.includes('victorian-tools.enforceColormaps'));
    assert.ok(commands.includes('victorian-tools.launchGame'));
    assert.ok(commands.includes('victorian-tools.openSettings'));
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const packageJson = extension?.packageJSON as {
      contributes?: {
        viewsContainers?: { activitybar?: { id?: string; icon?: string }[] };
        views?: Record<string, { id?: string }[]>;
      };
    };
    const container = packageJson.contributes?.viewsContainers?.activitybar?.find(
      (entry) => entry.id === 'victorianTools',
    );
    assert.ok(container, 'expected the victorianTools activity bar container');
    assert.strictEqual(container.icon, 'images/vicIItools.png');
    assert.ok(
      packageJson.contributes?.views?.['victorianTools']?.some((view) => view.id === 'victorianTools.actions'),
      'expected the actions view inside the container',
    );
    assert.strictEqual(packageJson.contributes?.views?.['victorianTools']?.length, 1, 'one tree view');
  });

  test('contributes snippets for both languages, and the files parse', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    const packageJson = extension.packageJSON as {
      contributes?: { snippets?: { language?: string; path?: string }[] };
    };
    const snippets = packageJson.contributes?.snippets ?? [];
    assert.deepStrictEqual(
      snippets.map((entry) => entry.language).sort(),
      ['victoria2', 'victoria2-csv'],
    );
    for (const entry of snippets) {
      assert.ok(entry.path, 'every snippet contribution needs a path');
      const filePath = path.join(extension.extensionPath, entry.path);
      assert.ok(fs.existsSync(filePath), `${entry.path} should ship with the extension`);
      // VS Code tolerates JSONC here, but keeping the files strict JSON means
      // any tool can read them.
      const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(typeof parsed === 'object' && parsed !== null);
      const entries = Object.values(parsed as Record<string, { prefix?: unknown; body?: unknown }>);
      assert.ok(entries.length > 0, `${entry.path} should define snippets`);
      for (const snippet of entries) {
        assert.strictEqual(typeof snippet.prefix, 'string');
        assert.ok(Array.isArray(snippet.body) || typeof snippet.body === 'string');
      }
    }
  });

  test('the manifest defaults match the server defaults', () => {
    // The server falls back to these values when the client cannot be reached,
    // so a drift between the two would silently change behavior (CLAUDE.md §8).
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const packageJson = extension?.packageJSON as {
      contributes?: { configuration?: { properties?: Record<string, { default?: unknown }> } };
    };
    const properties = packageJson.contributes?.configuration?.properties ?? {};
    assert.strictEqual(properties['victorianTools.validation.enable']?.default, true);
    assert.strictEqual(properties['victorianTools.validation.delay']?.default, 300);
    assert.strictEqual(properties['victorianTools.index.rebuildDelay']?.default, 500);
    assert.strictEqual(properties['victorianTools.index.onStartup']?.default, true);
    assert.strictEqual(properties['victorianTools.gamePath']?.default, '');
    assert.deepStrictEqual(properties['victorianTools.activeMods']?.default, []);
  });

  test('registers the victoria2 language', async () => {
    const languages = await vscode.languages.getLanguages();
    assert.ok(languages.includes('victoria2'));
  });

  test('contributes the victoria2 grammar', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const packageJson = extension?.packageJSON as {
      contributes?: { grammars?: { language?: string; scopeName?: string }[] };
    };
    const grammar = packageJson.contributes?.grammars?.find(
      (entry) => entry.language === 'victoria2',
    );
    assert.ok(grammar, 'expected a grammar contribution for victoria2');
    assert.strictEqual(grammar.scopeName, 'source.victoria2');
  });

  test('publishes diagnostics for a broken event file', async function (this: Mocha.Context): Promise<void> {
    this.timeout(20000);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2-'));
    const eventsDirectory = path.join(directory, 'events');
    fs.mkdirSync(eventsDirectory);
    const filePath = path.join(eventsDirectory, 'test_event.txt');
    // Missing `id` and an unclosed brace — should yield at least one diagnostic.
    fs.writeFileSync(filePath, 'country_event = {\n  title = "t"\n', 'utf8');

    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(uri, 15000);
    const codes = diagnostics.map((diagnostic) => codeToString(diagnostic.code));
    assert.ok(
      codes.includes('unbalanced-brace') || codes.includes('event-missing-id'),
      `expected a syntax/structure diagnostic, got: [${codes.join(', ')}]`,
    );
  });

  test('publishes a semantic diagnostic for an unknown TAG', async function (this: Mocha.Context): Promise<void> {
    this.timeout(20000);
    // A minimal mod: common/ marks the mod root so the identifier index builds.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2mod-'));
    fs.mkdirSync(path.join(directory, 'common'));
    fs.writeFileSync(
      path.join(directory, 'common', 'countries.txt'),
      'ENG = "countries/England.txt"\n',
      'utf8',
    );
    const eventsDirectory = path.join(directory, 'events');
    fs.mkdirSync(eventsDirectory);
    const filePath = path.join(eventsDirectory, 'semantic_event.txt');
    fs.writeFileSync(
      filePath,
      'country_event = {\n  id = 1\n  title = "t"\n  desc = "d"\n  is_triggered_only = yes\n  trigger = { tag = XYZ }\n  option = { name = "o" }\n}\n',
      'utf8',
    );

    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(uri, 15000);
    const codes = diagnostics.map((diagnostic) => codeToString(diagnostic.code));
    assert.ok(
      codes.includes('unknown-country'),
      `expected unknown-country, got: [${codes.join(', ')}]`,
    );
  });

  test('publishes a semantic diagnostic for a bad TAG in history/diplomacy', async function (this: Mocha.Context): Promise<void> {
    this.timeout(20000);
    // The mod lives under an unrelated `common/` segment on purpose: Steam
    // installs are `steamapps/common/<game>/mod/<mod>`, which must not break
    // file classification (regression test).
    const directory = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vic2dip-')),
      'steamapps',
      'common',
      'Victoria 2',
      'mod',
      'TestMod',
    );
    fs.mkdirSync(path.join(directory, 'common'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'common', 'countries.txt'),
      'ENG = "countries/England.txt"\nRUS = "countries/Russia.txt"\n',
      'utf8',
    );
    const diplomacyDirectory = path.join(directory, 'history', 'diplomacy');
    fs.mkdirSync(diplomacyDirectory, { recursive: true });
    const filePath = path.join(diplomacyDirectory, 'Alliances.txt');
    fs.writeFileSync(
      filePath,
      'alliance = {\n\tfirst = TUaR\n\tsecond = RUS\n\tstart_date = 1833.8.8\n\tend_date = 1840.1.1\n}\n',
      'utf8',
    );

    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(uri, 15000);
    const codes = diagnostics.map((diagnostic) => codeToString(diagnostic.code));
    assert.ok(
      codes.includes('unknown-country'),
      `expected unknown-country for TUaR, got: [${codes.join(', ')}]`,
    );
  });

  test('index duplicates stay visible while the file is open', async function (this: Mocha.Context): Promise<void> {
    this.timeout(20000);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vic2dup-'));
    fs.mkdirSync(path.join(directory, 'common'));
    const filePath = path.join(directory, 'common', 'countries.txt');
    fs.writeFileSync(
      filePath,
      'ENG = "countries/England.txt"\nENG = "countries/England2.txt"\n',
      'utf8',
    );

    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);

    const diagnostics = await waitForDiagnostics(uri, 15000);
    const codes = diagnostics.map((diagnostic) => codeToString(diagnostic.code));
    assert.ok(
      codes.includes('duplicate-identifier'),
      `expected duplicate-identifier for ENG, got: [${codes.join(', ')}]`,
    );
  });
});
