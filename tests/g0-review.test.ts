import { expect, it, vi, beforeEach } from 'vitest';
import { ESLint } from 'eslint';
it('rejects static, dynamic and type imports from any engine layer into tools', async () => {
  const eslint = new ESLint();
  for (const layer of ['platform', 'film', 'sim', 'data', 'api']) for (const code of ["import { FilmDriver } from '../../tools/film/driver';", "export { FilmDriver } from '../../tools/film/driver';", "void import('../../tools/film/driver');", "import type { FilmDriver } from '../../tools/film/driver';"]) {
    const [result] = await eslint.lintText(code, { filePath: `engine/${layer}/probe.ts` });
    expect(result!.messages.some(m => m.ruleId === 'architecture/boundary')).toBe(true);
  }
});
const mocks = vi.hoisted(() => ({ close: vi.fn((fn: (error?: Error) => void) => fn()), address: vi.fn((): unknown => ({ port: 4321 })), launch: vi.fn(), prepare: vi.fn(), encoder: vi.fn() }));
vi.mock('vite', () => ({ preview: vi.fn(async () => ({ httpServer: { address: mocks.address, close: mocks.close } })) }));
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }));
vi.mock('../tools/buildPack', () => ({ buildPack: vi.fn() }));
vi.mock('../tools/film/rehearse', () => ({ prepareFilm: mocks.prepare, rehearse: vi.fn(async () => ({ warnings: [] })) }));
vi.mock('../tools/film/video', () => ({ encoder: mocks.encoder }));
import { recordFilm } from '../tools/film/record';
beforeEach(() => {
  vi.clearAllMocks(); mocks.address.mockReturnValue({ port: 4321 });
  mocks.prepare.mockResolvedValue({ pack: { game: { screen: { width: 1, height: 1 } } }, film: { name: 'probe', steps: [] }, plugins: {} });
});
it('closes the preview server even when its address is invalid', async () => {
  mocks.address.mockReturnValue(null);
  await expect(recordFilm('demo', 'visit', { out: '/private/tmp/g0-cleanup' })).rejects.toThrow('Static server');
  expect(mocks.close).toHaveBeenCalledOnce();
});
it('closes the preview server if browser launch fails', async () => {
  mocks.launch.mockRejectedValue(new Error('launch failed'));
  await expect(recordFilm('demo', 'visit', { out: '/private/tmp/g0-cleanup' })).rejects.toThrow('launch failed');
  expect(mocks.close).toHaveBeenCalledOnce();
});
it.each(['next', 'abort', 'close'] as const)('cleans server/browser/encoder on %s failure or interruption', async mode => {
  const controller = new AbortController();
  const browserClose = vi.fn(async () => { if (mode === 'close') throw new Error('close failed'); });
  const page = { on: vi.fn(), addInitScript: vi.fn(), goto: vi.fn(), waitForFunction: vi.fn(), locator: () => ({ count: async () => 0 }), evaluate: vi.fn(async () => { if (mode === 'abort') controller.abort(); throw new Error('next failed'); }) };
  mocks.launch.mockResolvedValue({ newPage: async () => page, close: browserClose });
  const abort = vi.fn(async () => {}); mocks.encoder.mockReturnValue({ abort, write: vi.fn(), finish: vi.fn() });
  await expect(recordFilm('demo', 'visit', { out: '/private/tmp/g0-cleanup', signal: controller.signal } as Parameters<typeof recordFilm>[2])).rejects.toThrow();
  expect(abort).toHaveBeenCalledOnce(); expect(browserClose).toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
});
