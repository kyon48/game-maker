export interface EffectHandle { done: boolean }
interface Fade extends EffectHandle { from: number; to: number; elapsed: number; frames: number }
interface Shake extends EffectHandle { power: number; elapsed: number; frames: number }
export class Effects {
  alpha = 0;
  offset = 0;
  private fade: Fade | undefined;
  private shake: Shake | undefined;
  startFade(to: 'black' | 'clear', frames: number): EffectHandle {
    if (this.fade) this.fade.done = true;
    this.fade = { from: this.alpha, to: to === 'black' ? 1 : 0, elapsed: 0, frames, done: false }; return this.fade;
  }
  startShake(power: number, frames: number): EffectHandle {
    if (this.shake) this.shake.done = true;
    this.shake = { power, frames, elapsed: 0, done: false }; return this.shake;
  }
  advance(): void {
    const fade = this.fade;
    if (fade && !fade.done) {
      fade.elapsed++;
      this.alpha = fade.from + (fade.to - fade.from) * Math.min(1, fade.elapsed / fade.frames);
      fade.done = fade.elapsed >= fade.frames;
    }
    const shake = this.shake;
    if (shake && !shake.done) {
      shake.elapsed++;
      shake.done = shake.elapsed >= shake.frames;
      this.offset = shake.done ? 0 : shake.power * Math.sin(shake.elapsed * 1.3);
    }
  }
}
