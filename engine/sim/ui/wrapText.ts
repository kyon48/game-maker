import type { TextMeasurer } from '../ports';
export function wrapText(text: string, width: number, measurer: TextMeasurer): string[] {
  if (width <= 0) throw new Error('Message width must be positive');
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (measurer.width(candidate) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (measurer.width(word) <= width) { line = word; continue; }
      for (const point of word) {
        if (line && measurer.width(line + point) > width) { lines.push(line); line = ''; }
        line += point;
      }
    }
    lines.push(line);
  }
  return lines;
}
