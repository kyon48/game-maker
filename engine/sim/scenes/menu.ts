import { MenuArgs } from '../../data/scenes';
import type { SceneDefinition, DrawList } from '@engine/api';
import { wrapText } from '../ui/wrapText';
interface MenuState { width: number; height: number; lineHeight: number; labels: string[]; tab: number; selected: number; entries: { name: string; count: number; icon?: string; lines: string[]; category: string }[]; detail: boolean }

export const menu: SceneDefinition<Record<string, never>, MenuState> = {
  args: MenuArgs,
  init(_args, ctx) {
    return { ...ctx.screen, lineHeight: ctx.lineHeight, labels: [ctx.labels.menuItems!, ctx.labels.menuClues!, ctx.labels.menuClose!, ctx.labels.menuEmpty!], tab: 0, selected: 0, detail: false,
      entries: Object.entries(ctx.items).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([id]) => ctx.state.getItem(id) > 0).map(([id, item]) => ({ name: item.name, count: ctx.state.getItem(id), icon: item.icon, category: item.category, lines: wrapText(item.description, ctx.screen.width - 64, ctx.textMeasurer) })) };
  },
  update(state, input) {
    const entries = state.entries.filter(item => item.category === (state.tab === 0 ? 'item' : 'clue'));
    if (input.pressed.has('cancel')) return state.detail ? { ...state, detail: false } : { done: 0 };
    if (state.detail) return input.pressed.has('ok') ? { ...state, detail: false } : state;
    if (input.pressed.has('left') || input.pressed.has('right')) return { ...state, selected: 0, tab: (state.tab + (input.pressed.has('right') ? 1 : 2)) % 3 };
    if (input.pressed.has('ok')) return state.tab === 2 ? { done: 0 } : entries.length ? { ...state, detail: true } : state;
    if (entries.length && (input.pressed.has('up') || input.pressed.has('down'))) return { ...state, selected: (state.selected + (input.pressed.has('down') ? 1 : entries.length - 1)) % entries.length };
    return state;
  },
  view(state) {
    const draw: DrawList = [{ kind: 'rect', x: 0, y: 0, w: state.width, h: state.height, color: '#000000' }, { kind: 'window', x: 8, y: 8, w: state.width - 16, h: state.height - 16 }];
    state.labels.slice(0, 3).forEach((text, i) => draw.push({ kind: 'text', x: 20 + i * (state.width - 40) / 3, y: 20, text: (state.tab === i ? '> ' : '') + text, color: state.tab === i ? 'cursor' : 'text' }));
    if (state.tab === 2) return draw;
    const entries = state.entries.filter(item => item.category === (state.tab === 0 ? 'item' : 'clue'));
    if (!entries.length) draw.push({ kind: 'text', x: 24, y: 56, text: state.labels[3]! });
    else if (state.detail) {
      const item = entries[state.selected]!;
      draw.push({ kind: 'text', x: 24, y: 56, text: item.name });
      if (item.icon) draw.push({ kind: 'image', asset: item.icon, x: 24, y: 80 });
      item.lines.forEach((text, i) => draw.push({ kind: 'text', x: 48, y: 80 + i * state.lineHeight, text }));
    } else {
      const rows = Math.max(1, Math.floor((state.height - 72) / state.lineHeight)), first = Math.floor(state.selected / rows) * rows;
      entries.slice(first, first + rows).forEach((item, i) => draw.push({ kind: 'text', x: 24, y: 56 + i * state.lineHeight, text: (state.selected === first + i ? '> ' : '  ') + item.name + ' ×' + item.count }));
    }
    return draw;
  },
};
