import type { Static } from '@sinclair/typebox';
import { wrapText } from '../ui/wrapText';
import { EndingArgs } from '../../data/scenes';
import type { DrawList } from '../../data/scenes';
import type { SceneDefinition } from '@engine/api';
export const ending: SceneDefinition<Static<typeof EndingArgs>, { title: string; lines: string[]; image?: string; width: number; height: number; lineHeight: number; labels: string[]; choosing: boolean; selected: number }> = {
  args: EndingArgs,
  init: (args, ctx) => ({ ...args, lines: args.lines.flatMap(line => wrapText(line, ctx.screen.width - 48, ctx.textMeasurer)), lineHeight: ctx.lineHeight, ...ctx.screen, labels: [ctx.labels.newGame, ctx.labels.continue], choosing: false, selected: 0 }),
  update(state, input) {
    if (input.pressed.has('ok')) return state.choosing ? { done: state.selected } : { ...state, choosing: true };
    if (state.choosing && (input.pressed.has('up') || input.pressed.has('down') || input.pressed.has('left') || input.pressed.has('right'))) return { ...state, selected: 1 - state.selected };
    return state;
  },
  view(state) {
    const draw: DrawList = [{ kind: 'rect', x: 0, y: 0, w: state.width, h: state.height, color: '#000000' },
      { kind: 'window', x: 12, y: 12, w: state.width - 24, h: state.height - 24 },
      { kind: 'text', x: state.width / 2, y: 28, text: state.title, align: 'center' }];
    if (state.image) draw.push({ kind: 'image', asset: state.image, x: 24, y: 52 });
    state.lines.forEach((text, index) => draw.push({ kind: 'text', x: state.width / 2, y: 68 + index * state.lineHeight, text, align: 'center' }));
    if (state.choosing) state.labels.forEach((text, index) => draw.push({ kind: 'text', x: state.width / 2, y: state.height - 64 + index * 18, text: (index === state.selected ? '> ' : '  ') + text, align: 'center' }));
    return draw;
  },
};
