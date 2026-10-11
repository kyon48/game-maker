import { Type } from '@sinclair/typebox';
import type { PluginModule, DrawList } from '@engine/api';
/** Three lamps remember a short sequence. A wrong key ends the attempt; retry is free. */
const plugin: PluginModule = {
  id: 'lamps', apiVersion: 1,
  register(api) {
    api.scenes.register('x_lamps', {
      args: Type.Object({}, { additionalProperties: false }),
      init: (_args, ctx) => ({ sequence: Array.from({ length: 3 }, () => Math.floor(ctx.rng() * 3)), index: 0, width: ctx.screen.width, height: ctx.screen.height }),
      update(state, input) {
        if (input.pressed.has('cancel')) return { done: 0 };
        const selected = ['left', 'up', 'right'].findIndex(key => input.pressed.has(key as 'left' | 'up' | 'right'));
        if (selected < 0) return state;
        if (selected !== state.sequence[state.index]) return { done: 0 };
        return state.index === 2 ? { done: 1 } : { ...state, index: state.index + 1 };
      },
      view(state) {
        const draw: DrawList = [
          { kind: 'rect', x: 0, y: 0, w: state.width, h: state.height, color: '#171923' },
          { kind: 'window', x: 16, y: 16, w: state.width - 32, h: state.height - 32 },
          { kind: 'text', x: state.width / 2, y: 32, text: '기억의 조명', align: 'center' },
          { kind: 'text', x: state.width / 2, y: 58, text: '켜진 조명의 방향키를 세 번 눌러 주세요.', align: 'center' },
          { kind: 'text', x: state.width / 2, y: state.height - 48, text: '왼쪽 ←   가운데 ↑   오른쪽 →   취소 Esc', align: 'center' },
        ];
        for (let i = 0; i < 3; i++) draw.push({ kind: 'rect', x: state.width / 2 - 72 + i * 56, y: 108, w: 32, h: 32, color: i === state.sequence[state.index] ? '#f4ce69' : '#414856' });
        return draw;
      },
    });
  },
};
export default plugin;
