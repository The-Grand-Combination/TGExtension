import { RIVER_MERGE, RIVER_SEA, RIVER_SOURCE } from '../data/mapPalettes.js';
import type { Pixel } from '../model/mapAudit.js';

/**
 * Shape rules for rivers.bmp, over the top-down index array. Every index below
 * 254 is river (TGC paints a wide river with index 16, which the game draws);
 * a river is a 1-pixel line that starts at a source (0) and may join another
 * river through a merge pixel (1). Neighbours are the 8 surrounding pixels:
 * mappers place sources and merges diagonally.
 */

export type RiverIssueCode = 'river-isolated-pixel' | 'river-merge-detached' | 'river-thick';

export interface RiverPixelIssue extends Pixel {
  readonly code: RiverIssueCode;
}

/** A connected river (8-neighbourhood); `x`/`y` is its top-most, left-most pixel. */
export interface RiverComponent extends Pixel {
  readonly size: number;
}

export interface RiverAnalysis {
  readonly issues: readonly RiverPixelIssue[];
  /** Rivers of more than one pixel with no source pixel; the engine never draws them. */
  readonly sourceless: readonly RiverComponent[];
  /** Rivers of more than one pixel that touch no sea pixel anywhere (closed basins). */
  readonly landlocked: readonly RiverComponent[];
}

export type SeaTest = (offset: number) => boolean;

export function analyzeRivers(rivers: Uint8Array, width: number, height: number, isSea: SeaTest): RiverAnalysis {
  const grid = new Grid(rivers, width, height);
  const riverOffsets = grid.riverOffsets();
  const issues: RiverPixelIssue[] = [];
  for (const offset of riverOffsets) {
    issues.push(...pixelIssues(grid, offset));
  }
  const components = riverComponents(grid, riverOffsets, isSea);
  return {
    issues,
    sourceless: components.filter((component) => !component.hasSource).map(toComponent),
    landlocked: components.filter((component) => !component.touchesSea).map(toComponent),
  };
}

const NEIGHBOUR_STEPS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

class Grid {
  constructor(
    private readonly rivers: Uint8Array,
    readonly width: number,
    readonly height: number,
  ) {}

  isRiver(offset: number): boolean {
    return (this.rivers[offset] ?? RIVER_SEA) < RIVER_SEA;
  }

  valueAt(offset: number): number {
    return this.rivers[offset] ?? RIVER_SEA;
  }

  pixelOf(offset: number): Pixel {
    return { x: offset % this.width, y: Math.floor(offset / this.width) };
  }

  /** Offsets of the 8 neighbours inside the image. */
  neighbours(offset: number): number[] {
    const { x, y } = this.pixelOf(offset);
    const found: number[] = [];
    for (const [dx, dy] of NEIGHBOUR_STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        found.push(ny * this.width + nx);
      }
    }
    return found;
  }

  riverNeighbours(offset: number): number[] {
    return this.neighbours(offset).filter((neighbour) => this.isRiver(neighbour));
  }

  riverOffsets(): number[] {
    const found: number[] = [];
    for (let offset = 0; offset < this.rivers.length; offset++) {
      if (this.isRiver(offset)) {
        found.push(offset);
      }
    }
    return found;
  }

  /** The 2x2 block whose top-left corner is `offset` is all river. */
  startsThickBlock(offset: number): boolean {
    const { x, y } = this.pixelOf(offset);
    if (x + 1 >= this.width || y + 1 >= this.height) {
      return false;
    }
    return this.isRiver(offset + 1) && this.isRiver(offset + this.width) && this.isRiver(offset + this.width + 1);
  }
}

function pixelIssues(grid: Grid, offset: number): RiverPixelIssue[] {
  const pixel = grid.pixelOf(offset);
  const issues: RiverPixelIssue[] = [];
  const riverNeighbours = grid.riverNeighbours(offset).length;
  if (riverNeighbours === 0) {
    issues.push({ ...pixel, code: 'river-isolated-pixel' });
  } else if (grid.valueAt(offset) === RIVER_MERGE && riverNeighbours < 2) {
    issues.push({ ...pixel, code: 'river-merge-detached' });
  }
  if (grid.startsThickBlock(offset)) {
    issues.push({ ...pixel, code: 'river-thick' });
  }
  return issues;
}

interface Component {
  readonly size: number;
  readonly hasSource: boolean;
  readonly touchesSea: boolean;
  /** The lowest offset: top-most, then left-most pixel. */
  readonly first: number;
  readonly grid: Grid;
}

function toComponent(component: Component): RiverComponent {
  return { ...component.grid.pixelOf(component.first), size: component.size };
}

/** Flood-fill every river; lone pixels are left to the pixel rules. */
function riverComponents(grid: Grid, riverOffsets: readonly number[], isSea: SeaTest): Component[] {
  const unvisited = new Set(riverOffsets);
  const found: Component[] = [];
  for (const start of riverOffsets) {
    if (!unvisited.has(start)) {
      continue;
    }
    const component = floodFill(grid, start, unvisited, isSea);
    if (component.size > 1) {
      found.push(component);
    }
  }
  return found;
}

function floodFill(grid: Grid, start: number, unvisited: Set<number>, isSea: SeaTest): Component {
  const stack = [start];
  unvisited.delete(start);
  let size = 0;
  let hasSource = false;
  let touchesSea = false;
  let first = start;
  while (stack.length > 0) {
    const offset = stack.pop() ?? start;
    size++;
    hasSource ||= grid.valueAt(offset) === RIVER_SOURCE;
    first = Math.min(first, offset);
    for (const neighbour of grid.neighbours(offset)) {
      touchesSea ||= isSea(neighbour);
      if (grid.isRiver(neighbour) && unvisited.delete(neighbour)) {
        stack.push(neighbour);
      }
    }
  }
  return { size, hasSource, touchesSea, first, grid };
}
