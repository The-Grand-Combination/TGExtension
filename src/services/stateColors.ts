import type { Rgb } from '../model/mapEditor.js';

/**
 * A colour for a state of `map/region.txt`. The game gives states none, and
 * the ones it draws shift whenever the map changes; here the colour is a hash
 * of the state's name, so it stays the same through any amount of editing and
 * two mods that share a state name share its colour.
 */
export function stateColorOf(name: string): Rgb {
  const hash = fnv1a(name.toLowerCase());
  // The hue takes the hash; the two other channels move a little with it, so
  // states next to each other on the wheel still tell apart.
  const hue = hash % 360;
  const saturation = 0.55 + ((hash >>> 9) % 30) / 100;
  const lightness = 0.45 + ((hash >>> 14) % 20) / 100;
  return hslToRgb(hue, saturation, lightness);
}

/** 32-bit FNV-1a: small, spreads well, and the same everywhere. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] = sector < 1 ? [chroma, second, 0]
    : sector < 2 ? [second, chroma, 0]
      : sector < 3 ? [0, chroma, second]
        : sector < 4 ? [0, second, chroma]
          : sector < 5 ? [second, 0, chroma]
            : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return [Math.round((red + offset) * 255), Math.round((green + offset) * 255), Math.round((blue + offset) * 255)];
}
