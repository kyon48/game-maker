import { Type } from '@sinclair/typebox';
import type { PluginModule, ReadonlyGameState } from '@engine/api';

// The clue flags are the source of truth; revisiting evidence never inflates a counter.
const clues = [
  ['clue_clock', '시계: 정전 때 떨어졌으며 출입 시각을 증명하지 않는다.'],
  ['clue_seal', '봉인: 부인의 문장으로 봉한 원본을 공증인에게 발송했다.'],
  ['clue_letter', '편지: 부인이 원본 발송과 해린의 등사본 보관을 지시했다.'],
  ['clue_ledger', '장부: 도서실은 마을에 증여되었고 해린은 관리인이다.'],
  ['clue_receipt', '영수증: 임종 뒤 구입한 식물 치료제로 독살 소문과 무관하다.'],
] as const;
const count = (state: Pick<ReadonlyGameState, 'getFlag'>) => clues.reduce((total, [flag]) => total + (state.getFlag(flag) ? 1 : 0), 0);
const plugin: PluginModule = {
  apiVersion: 1,
  id: 'evidence',
  register(api) {
    api.conditions.register('x_enough_clues', {
      args: Type.Object({ minimum: Type.Integer({ minimum: 0, maximum: 5 }) }, { additionalProperties: false }),
      test: (args, state) => count(state) >= args.minimum,
    });
    api.commands.register('x_review_clues', {
      args: Type.Object({}, { additionalProperties: false }),
      parallelSafe: false,
      *run(_args, ctx) {
        const total = count(ctx.state);
        yield* ctx.showText({ speaker: '윤서', text: `조사 수첩 — 단서 ${total}/5\n네 가지 이상의 단서를 모으면 기록을 근거로 결론을 낼 수 있다. 약속을 조용히 잇는 길에는 편지와 해린의 신뢰도 필요하다.` });
        for (const [flag, summary] of clues) if (ctx.state.getFlag(flag)) yield* ctx.showText({ text: summary });
        if (total === 0) yield* ctx.showText({ text: '현관홀의 시계, 서재의 서랍과 편지철, 도서실의 장부, 온실의 작업대를 살펴보자.' });
      },
    });
  },
};
export default plugin;
