import { expect, it } from 'vitest';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
import { wrapText } from '../engine/sim/ui/wrapText';
import { MessageState } from '../engine/sim/ui/MessageState';
import { ChoiceState } from '../engine/sim/ui/ChoiceState';
import type { Action } from '../engine/sim/ports';
const input = (...pressed: Action[]) => ({ held: new Set<Action>(), pressed: new Set(pressed) });
it('wraps by words, splits long Unicode words and honors explicit empty lines', () => {
  const measure = new HeadlessTextMeasurer(12);
  expect(wrapText('one two abcdefgh', 30, measure)).toEqual(['one', 'two', 'abcde', 'fgh']);
  expect(wrapText('가😀나다\n\n끝', 24, measure)).toEqual(['가😀', '나다', '', '끝']);
});
it('reveals Unicode codepoints, reveals whole page on ok, then advances or closes; cancel equals ok', () => {
  const message = new MessageState({ width: 24, rows: 1, charsPerTick: 1 }, new HeadlessTextMeasurer(12));
  message.open({ speaker: '화자', text: '가😀\n나다' });
  message.update(input()); expect(message.snapshot?.lines).toEqual(['가']);
  message.update(input('ok')); expect(message.snapshot?.lines).toEqual(['가😀']);
  message.update(input('ok')); expect(message.snapshot?.page).toBe(1); expect(message.snapshot?.lines).toEqual(['']);
  message.update(input('cancel')); expect(message.snapshot?.lines).toEqual(['나다']);
  message.update(input('cancel')); expect(message.opened).toBe(false);
});
it('choices preserve original indexes, wrap and return cancel index including hidden option', () => {
  const choice = new ChoiceState(); choice.open({ labels: [null, 'A', null, 'B'], cancelIndex: 2 });
  expect(choice.snapshot?.selected).toBe(1);
  choice.update(input('up')); expect(choice.snapshot?.selected).toBe(3);
  choice.update(input('down')); expect(choice.snapshot?.selected).toBe(1);
  choice.update(input('down')); choice.update(input('ok')); expect(choice.result).toBe(3); expect(choice.opened).toBe(false);
  choice.open({ labels: [null, 'A', null, 'B'], cancelIndex: 2 }); choice.update(input('cancel')); expect(choice.result).toBe(2);
});
it('null cancel is ignored, zero visible options do not open, and invalid cancel index is rejected', () => {
  const choice = new ChoiceState(); choice.open({ labels: ['A'], cancelIndex: null }); choice.update(input('cancel')); expect(choice.opened).toBe(true);
  choice.close(); choice.open({ labels: [null], cancelIndex: null }); expect(choice.opened).toBe(false); expect(choice.result).toBe(-1);
  expect(() => choice.open({ labels: ['A'], cancelIndex: 1 })).toThrow('out of range');
});
