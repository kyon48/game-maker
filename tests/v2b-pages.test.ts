import { expect, it } from 'vitest';
import { MessageState } from '../engine/sim/ui/MessageState';
import { HeadlessTextMeasurer } from '../engine/sim/HeadlessTextMeasurer';
const empty = { held: new Set<never>(), pressed: new Set<never>() };
it('recording keeps each page visible for its proportional voice duration', () => {
  const message = new MessageState({ width: 12, rows: 1, charsPerTick: 10 }, new HeadlessTextMeasurer(12), undefined, () => ({ voiceKey: 'key', voiceFrames: 20, auto: true, gapTicks: 0 }));
  message.open({ text: 'ABCD' });
  expect(message.snapshot?.pageCount).toBe(2);
  for (let i = 0; i < 19; i++) message.update(empty);
  expect(message.snapshot?.page).toBe(0);
  message.update(empty); expect(message.snapshot?.page).toBe(1);
  for (let i = 0; i < 19; i++) message.update(empty);
  expect(message.opened).toBe(true);
  message.update(empty); expect(message.opened).toBe(false);
});

it('page allocation has no fractional accumulation drift and manual pages still use ok', () => {
  const create = (auto: boolean) => new MessageState({ width: 6, rows: 1, charsPerTick: 10 }, new HeadlessTextMeasurer(12), undefined, () => ({ voiceKey: 'key', voiceFrames: 9, auto, gapTicks: 0 }));
  const message = create(true); message.open({ text: 'ABCDEFGHI' });
  for (let i = 0; i < 17; i++) message.update(empty);
  expect(message.opened).toBe(true); message.update(empty); expect(message.opened).toBe(false);
  const manual = create(false); manual.open({ text: 'ABCDEFGHI' });
  for (let i = 0; i < 100; i++) manual.update(empty);
  expect(manual.snapshot?.page).toBe(0);
  manual.update({ held: new Set(['ok']), pressed: new Set(['ok']) }); expect(manual.snapshot?.page).toBe(1);
});
