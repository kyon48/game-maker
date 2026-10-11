import type { PluginModule } from '@engine/api';
// Before G2, these once-only examinations granted clue flags instead of items.
const examined = { clue_clock: 'hall:clock:examined', clue_seal: 'study:seal:examined', clue_letter: 'study:letter:examined', clue_ledger: 'library:ledger:examined', clue_receipt: 'greenhouse:receipt:examined' };
const plugin: PluginModule = { id: 'evidence', apiVersion: 1, register(api) {
  api.hooks.on('loadSave', (save, from) => {
    if (from !== '0.1.0') return;
    for (const [item, key] of Object.entries(examined)) if (save.selfFlags[key] && !save.items[item]) save.items[item] = 1;
  });
} };
export default plugin;
