import { expect, it, vi } from 'vitest';
import { SaveStorage } from '../engine/platform/storage';
const metadata = { packId: 'test', gameVersion: '1.0.0', engineVersion: '0.2.0' };
const state = { map: 'map', x: 1, y: 1, dir: 'down' as const, flags: {}, vars: {}, selfFlags: {} };
it('treats a throwing storage getter/read as no save without interrupting startup', () => {
  const inaccessible = { getItem() { throw new Error('blocked'); }, setItem() {} };
  expect(new SaveStorage(inaccessible, metadata).read()).toBeNull();
});
it('warns on write failure and lets execution after save continue', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const failing = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
    expect(() => new SaveStorage(failing, metadata).write(state)).not.toThrow(); expect(warning).toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
it('catches storage acquisition exceptions before any storage method can run', () => {
  const acquire = () => { throw new Error('security'); };
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const storage = new SaveStorage(acquire, metadata); expect(storage.read()).toBeNull();
    expect(() => storage.write(state)).not.toThrow(); expect(warning).toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
