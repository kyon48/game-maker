import { parseText, TextSyntaxError } from '../text';
import type { ValidationContext, Usage } from './context';
import type { PackBasics } from './coreRules';
export function textRules(context: ValidationContext, basics: PackBasics, usage: Usage, value: string, controls: boolean, file: string, pointer: string): void {
  try {
    for (const token of parseText(value, controls)) {
      if (token.kind === 'var') {
        usage.usedVars.add(token.value);
        if (!Object.hasOwn(basics.game.state.vars, token.value)) context.report('V3', file, pointer, `Undeclared text variable: ${token.value} (offset ${token.offset})`);
      } else if (token.kind === 'plugin') {
        const schema = context.options.text?.get(token.value);
        if (!schema) context.report('V3', file, pointer, `Unregistered text function: ${token.value} (offset ${token.offset})`);
        else context.check(schema, {}, file, pointer);
      } else if (token.kind === 'color' && token.value && !Object.hasOwn(basics.skin.colors, token.value)) context.report('V3', file, pointer, `Unknown text color: ${token.value} (offset ${token.offset})`);
    }
  } catch (error) {
    if (!(error instanceof TextSyntaxError)) throw error;
    context.report('V1', file, pointer, error.message);
  }
}
