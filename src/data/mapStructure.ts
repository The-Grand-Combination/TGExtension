import type { FieldTable } from '../model/symbols.js';

/** map/default.map scalar fields (NCE default_map_file). File-name values are unchecked. */
export const DEFAULT_MAP_SCALAR_FIELDS: FieldTable = {
  max_provinces: ['number'],
  definitions: ['string'],
  provinces: ['string'],
  positions: ['string'],
  terrain: ['string'],
  rivers: ['string'],
  terrain_definition: ['string'],
  tree_definition: ['string'],
  continent: ['string'],
  adjacencies: ['string'],
  region: ['string'],
  region_sea: ['string'],
  province_flag_sprite: ['string'],
  tree: ['number'],
  border_cutoff: ['number'],
};

/** map/default.map number-list fields; only `sea_starts` is read by the engine. */
export const DEFAULT_MAP_LIST_FIELDS: ReadonlySet<string> = new Set([
  'sea_starts',
  'border_heights',
  'terrain_sheet_heights',
]);

/** map/terrain.txt category fields beyond modifier values (NCE terrain_modifier). */
export const TERRAIN_CATEGORY_FIELDS: FieldTable = {
  is_water: ['yesno'],
  tree: ['yesno'],
  tree_density: ['number'],
};

/** map/terrain.txt palette entries: `type` is checked against the file's categories. */
export const TERRAIN_PALETTE_FIELDS: FieldTable = {
  has_texture: ['yesno'],
  priority: ['number'],
};

/** map/positions.txt per-province scalar fields (NCE province_position). */
export const POSITION_SCALAR_FIELDS: FieldTable = {
  text_rotation: ['number'],
  text_scale: ['number'],
};

/** map/positions.txt `text_position = { x y }` (NCE province_xy_pair). */
export const POSITION_XY_FIELDS: FieldTable = {
  x: ['number'],
  y: ['number'],
};

/** map/positions.txt per-province blocks the engine reads or discards. */
export const POSITION_BLOCK_FIELDS: ReadonlySet<string> = new Set([
  'text_position',
  'unit',
  'building_construction',
  'military_construction',
  'factory',
  'building_position',
  'building_rotation',
  'spawn_railway_track',
  'city',
  'railroad_visibility',
  'town',
  'building_nudge',
]);

/** map/adjacencies.csv `Type` column (NCE read_map_adjacency; `land` is accepted and ignored). */
export const ADJACENCY_TYPES: ReadonlySet<string> = new Set(['sea', 'land', 'impassable', 'canal']);
