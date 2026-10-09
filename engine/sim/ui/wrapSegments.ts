import type { TextMeasurer } from '../ports';
import type { DisplaySegment } from '../../data/text';
import { wrapText } from './wrapText';
/** Keep existing word wrapping while carrying style/waits across normalized whitespace. */
export function wrapSegments(segments: readonly DisplaySegment[], width: number, measurer: TextMeasurer): DisplaySegment[][] {
  const lines = wrapText(segments.map(s => s.text).join(''), width, measurer);
  let cursor = 0, wait = 0;
  const result = lines.map(line => [...line].map(point => {
    while (cursor < segments.length && segments[cursor]!.text !== point) {
      const skipped = segments[cursor++]!;
      if (skipped.text && !/\s/u.test(skipped.text)) throw new Error('Styled wrapping mismatch');
      wait += skipped.wait;
    }
    const segment = segments[cursor++];
    if (!segment) throw new Error('Styled wrapping exhausted text');
    const wrapped = { ...segment, wait: segment.wait + wait }; wait = 0; return wrapped;
  }));
  while (cursor < segments.length) wait += segments[cursor++]!.wait;
  if (wait) result.at(-1)!.push({ text: '', speed: 1, wait });
  return result;
}
