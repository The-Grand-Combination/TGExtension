/**
 * Event and decision body fields, from Event_modding.md / Decision_modding.md.
 * These are structural keys, not triggers or effects; the semantic walker
 * treats them specially or skips them.
 */

export const EVENT_BODY_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'title',
  'desc',
  'picture',
  'major',
  'election',
  'news',
  'news_title',
  'news_desc_long',
  'news_desc_medium',
  'news_desc_short',
  'fire_only_once',
  'is_triggered_only',
  'allow_multiple_instances',
  'issue_group',
]);

export const EVENT_TRIGGER_FIELDS: ReadonlySet<string> = new Set(['trigger']);
export const EVENT_EFFECT_FIELDS: ReadonlySet<string> = new Set(['immediate']);

export const DECISION_BODY_FIELDS: ReadonlySet<string> = new Set([
  'picture',
  'alert',
  'news',
  'news_title',
  'news_desc_long',
  'news_desc_medium',
  'news_desc_short',
]);

export const DECISION_TRIGGER_FIELDS: ReadonlySet<string> = new Set(['potential', 'allow']);
export const DECISION_EFFECT_FIELDS: ReadonlySet<string> = new Set(['effect']);

/** Keys valid inside `mean_time_to_happen` / `ai_will_do` / `ai_chance` blocks. */
export const WEIGHT_BLOCK_DURATION_FIELDS: ReadonlySet<string> = new Set([
  'months',
  'days',
  'years',
  'factor',
  'base',
]);

/** Logical operators — pass through the current scope in trigger context. */
export const LOGICAL_OPERATORS: ReadonlySet<string> = new Set(['and', 'or', 'not']);

export const EVENT_LOC_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'desc',
  'news_title',
  'news_desc_long',
  'news_desc_medium',
  'news_desc_short',
]);
