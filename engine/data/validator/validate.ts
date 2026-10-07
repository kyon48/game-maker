import type { PackSource } from '@engine/api';
import type { Diagnostic, ValidationOptions, ValidatedPack } from './types';
import { validationContext, createUsage } from './context';
import { coreRules } from './coreRules';
import { mapRules } from './mapRules';
import { eventRules } from './eventRules';
import { finishRules } from './finishRules';
export async function validatePack(source: PackSource, id: string, options: ValidationOptions): Promise<{ diagnostics: Diagnostic[]; pack?: ValidatedPack }> {
  const context = validationContext(source, id, options), { diagnostics } = context;
  const basics = await coreRules(context);
  if (!basics) return { diagnostics };
  const usage = createUsage(basics.characters, context.report);
  usage.characterReference(basics.game.player, 'game.json', '/player');
  const checks = await mapRules(context, basics);
  eventRules(context, basics, checks, usage);
  await finishRules(context, basics, usage);
  return { diagnostics, pack: diagnostics.some(result => result.level === 'error') ? undefined : { ...basics, events: checks.events, maps: checks.maps } };
}
