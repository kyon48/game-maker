import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
const configRoot = path.dirname(fileURLToPath(import.meta.url));
const projectPath = (filename, cwd) => path.relative(configRoot, path.resolve(cwd, filename)).split(path.sep).join('/');
const resolvedBoundary = {
  meta: { type: 'problem', schema: [], messages: { boundary: '명세 §4.2 import 경계 위반: {{source}}' } },
  create(context) {
    const origin = projectPath(context.filename, context.cwd);
    const layer = origin.match(/^engine\/(sim|data|api|film)\//)?.[1];
    const plugin = /^packs\/[^/]+\/plugins\//.test(origin);
    const engine = origin.startsWith('engine/');
    const tool = origin.startsWith('tools/');
    if (!layer && !plugin && !tool && !engine) return {};
    function check(node) {
      const source = node.source?.value ?? node.argument?.value;
      if (typeof source !== 'string') return;
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type'
        || (node.specifiers?.length > 0 && node.specifiers.every(specifier => specifier.importKind === 'type' || specifier.exportKind === 'type'));
      const target = source.startsWith('.')
        ? projectPath(path.resolve(context.cwd, path.dirname(context.filename), source), context.cwd)
        : source.startsWith('@engine/') ? 'engine/' + source.slice(8) : source;
      const targetLayer = target.match(/^engine\/(sim|data|api)(?:\/|$)/)?.[1];
      const typebox = /^@sinclair\/typebox(?:\/|$)/.test(source);
      let allowed = typebox;
      if (engine && /^tools(?:\/|$)/.test(target)) { context.report({ node, messageId: 'boundary', data: { source } }); return; }
      if (plugin) allowed ||= source === '@engine/api';
      else if (tool) allowed = !/^engine\/platform(?:\/|$)/.test(target);
      else if (layer === 'sim') allowed ||= targetLayer === 'sim' || targetLayer === 'data' || (targetLayer === 'api' && typeOnly);
      else if (layer === 'data') allowed ||= targetLayer === 'data' || (targetLayer === 'api' && typeOnly);
      else if (layer === 'film') allowed ||= /^engine\/(film|sim|data|api)(?:\/|$)/.test(target);
      else if (!layer && engine) allowed = true;
      else if (layer === 'api') allowed ||= ['sim', 'data', 'api'].includes(targetLayer);
      if (!allowed) context.report({ node, messageId: 'boundary', data: { source } });
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check };
  },
};
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.omc/**', 'docs/**', 'out/**'] },
  ...tseslint.configs.recommended,
  { plugins: { architecture: { rules: { boundary: resolvedBoundary } } }, rules: { 'architecture/boundary': 'error' } },
  { files: ['**/engine/sim/**/*.ts', '**/packs/*/plugins/**/*.ts'], rules: {
    'no-restricted-properties': ['error', { object: 'Math', property: 'random' }, { object: 'Date', property: 'now' }, { object: 'performance', property: 'now' }],
  } },
);
