import type { InputFrame } from '../sim/ports';
const STEP = 1000 / 60;
export class FixedTickLoop {
  private previous: number | undefined;
  private accumulator = 0;
  constructor(private readonly tick: (input: InputFrame) => void,
    private readonly input: () => InputFrame, private readonly render: () => void) {}
  frame(time: number): void {
    if (this.previous !== undefined) this.accumulator += Math.max(0, Math.min(250, time - this.previous));
    this.previous = time;
    while (this.accumulator + 1e-8 >= STEP) {
      this.tick(this.input());
      this.accumulator = Math.max(0, this.accumulator - STEP);
    }
    this.render();
  }
}
export function startLoop(loop: FixedTickLoop, onError: (error: unknown) => void): () => void {
  let id = 0;
  const frame = (time: number) => {
    try { loop.frame(time); id = requestAnimationFrame(frame); }
    catch (error) { onError(error); }
  };
  id = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(id);
}
