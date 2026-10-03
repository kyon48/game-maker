import type { Action, InputFrame } from '../sim/ports';
const mapping: Readonly<Record<string, Action>> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'ok', Enter: 'ok', Space: 'ok', KeyX: 'cancel', Escape: 'cancel',
};
export class Keyboard {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<Action>();
  private readonly down = (event: KeyboardEvent) => {
    const action = mapping[event.code];
    if (!action) return;
    event.preventDefault();
    if (!this.keys.has(event.code) && !event.repeat) { this.pressed.delete(action); this.pressed.add(action); }
    this.keys.add(event.code);
  };
  private readonly up = (event: KeyboardEvent) => {
    if (!mapping[event.code]) return;
    event.preventDefault(); this.keys.delete(event.code);
  };
  private readonly blur = () => { this.keys.clear(); this.pressed.clear(); };
  constructor(private readonly target: EventTarget) {
    target.addEventListener('keydown', this.down as EventListener);
    target.addEventListener('keyup', this.up as EventListener);
    target.addEventListener('blur', this.blur);
  }
  consume(): InputFrame {
    const held = new Set<Action>();
    for (const key of this.keys) { const action = mapping[key]; if (action) held.add(action); }
    const pressed = new Set(this.pressed); this.pressed.clear();
    return { held, pressed };
  }
  dispose(): void {
    this.target.removeEventListener('keydown', this.down as EventListener);
    this.target.removeEventListener('keyup', this.up as EventListener);
    this.target.removeEventListener('blur', this.blur);
    this.blur();
  }
}
