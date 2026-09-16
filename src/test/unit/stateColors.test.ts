import * as assert from 'node:assert';
import { stateColorOf } from '../../services/stateColors.js';

suite('stateColors', () => {
  test('the same name is the same colour, whatever its case', () => {
    assert.deepStrictEqual(stateColorOf('ENG_1'), stateColorOf('ENG_1'));
    assert.deepStrictEqual(stateColorOf('ENG_1'), stateColorOf('eng_1'));
  });

  test('neighbouring names tell apart', () => {
    const names = ['ENG_1', 'ENG_2', 'ENG_3', 'FRA_1', 'USA_3', 'PRU_10', 'RUS_100', 'BRZ_2'];
    const seen = new Set(names.map((name) => stateColorOf(name).join(',')));
    assert.strictEqual(seen.size, names.length);
  });

  test('every channel is a byte, and no colour is too dark or too pale to read', () => {
    for (const name of ['a', 'ENG_1', 'a very long state name indeed']) {
      const color = stateColorOf(name);
      for (const channel of color) {
        assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255, color.join(','));
      }
      const brightness = (color[0] + color[1] + color[2]) / 3;
      assert.ok(brightness > 40 && brightness < 220, color.join(','));
    }
  });
});
