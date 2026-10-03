import { diagnostic, type Diagnostic } from '../model/diagnostic.js';
import type { ValidationOptions } from '../model/validationOptions.js';
import { csvRows, type CsvField, type CsvRow } from '../parser/csv.js';

/**
 * Checks over a `localisation/*.csv`. The event window draws a description in
 * a box of fixed size, so a text past `eventDescMaxLength` characters most
 * likely overflows it. Only the rows whose key `eventDescPattern` matches are
 * measured, in every language column.
 */
export function validateLocalisation(text: string, options: ValidationOptions): Diagnostic[] {
  const found: Diagnostic[] = [];
  for (const row of csvRows(text)) {
    const key = row.fields[0]?.text ?? '';
    if (key === '' || !isEventDescription(key, options)) {
      continue;
    }
    for (const field of languageColumns(row)) {
      if (field.text.length > options.eventDescMaxLength) {
        found.push(tooLong(key, field, options.eventDescMaxLength));
      }
    }
  }
  return found;
}

function isEventDescription(key: string, options: ValidationOptions): boolean {
  return options.eventDescPattern === undefined || options.eventDescPattern.test(key);
}

/** Every column after the key, minus the `x` the engine uses to end a row. */
function languageColumns(row: CsvRow): CsvField[] {
  return row.fields.slice(1).filter((field) => field.text !== '' && field.text !== 'x');
}

function tooLong(key: string, field: CsvField, limit: number): Diagnostic {
  return diagnostic(
    'warning',
    'event-desc-too-long',
    `'${key}' is ${String(field.text.length)} characters long, past the ${String(limit)} the event window can show: ` +
      'the text will probably overflow its box. Shorten it or split the event.',
    field.range,
  );
}
