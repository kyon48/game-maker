import { registerBgm } from './bgm';
import { registerSfx } from './sfx';
import { registerGiveItem } from './give_item';
import { registerTakeItem } from './take_item';
import { registerScene } from './scene';
import { registerFilmCue } from './film_cue';
import { registerShowMapName } from './show_map_name';
import { registerSave } from './save';
import { CommandRegistry as Registry } from '../event/CommandRegistry';
import { registerTransfer } from './transfer';
import { registerShowCharacter } from './show_character';
import { registerShake } from './shake';
import { registerFade } from './fade';
import { registerMove } from './move';
import { registerCall } from './call';
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
  registerBgm(registry); registerSfx(registry);
  registerGiveItem(registry); registerTakeItem(registry);
  registerScene(registry);
  registerFilmCue(registry);
  registerShowMapName(registry);
  registerSave(registry);
  registerTransfer(registry);
  registerShowCharacter(registry);
  registerShake(registry);
  registerFade(registry);
  registerMove(registry);
  registerCall(registry);
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

export function builtinCatalog() {
  const registry = new Registry(); registerBuiltins(registry);
  return registry.catalog;
}
