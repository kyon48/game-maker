import { registerText } from './text';
import { registerWait } from './wait';
import { registerStop } from './stop';
import { registerSetFlag } from './set_flag';
import { registerSetVar } from './set_var';
import { registerSetSelfFlag } from './set_self_flag';
import { registerFace } from './face';
import { registerIf } from './if';
import { registerChoice } from './choice';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerBuiltins(registry: CommandRegistry): void {
  registerText(registry);
  registerWait(registry);
  registerStop(registry);
  registerSetFlag(registry);
  registerSetVar(registry);
  registerSetSelfFlag(registry);
  registerFace(registry);
  registerIf(registry);
  registerChoice(registry);
}
