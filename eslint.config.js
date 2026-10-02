import path from 'node:path';
import tseslint from 'typescript-eslint';
const boundary = (regex, allowTypeImports = false) => ({ regex, allowTypeImports, message: '명세 §4.2 import 경계 위반' });
const typebox = '@sinclair/typebox(?:/.*)?';
const local = '(?:\\./|\\.\\./)';
const resolvedBoundary = {
  meta: { type: 'problem', schema: [], messages: { boundary: '명세 §4.2 import 경계 위반: {{source}}' } },
  create(context) {
    const origin = path.relative(process.cwd(), context.filename).split(path.sep).join('/');
    const layer = origin.match(/^engine\/(sim|data|api)\//)?.[1];
    const plugin = /^packs\/[^/]+\/plugins\//.test(origin);
    const tool = origin.startsWith('tools/');
    if (!layer && !plugin && !tool) return {};
    function check(node) {
      const source = node.source?.value ?? node.argument?.value;
      if (typeof source !== 'string') return;
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type'
        || (node.specifiers?.length > 0 && node.specifiers.every(specifier => specifier.importKind === 'type' || specifier.exportKind === 'type'));
      const target = source.startsWith('.')
        ? path.relative(process.cwd(), path.resolve(path.dirname(context.filename), source)).split(path.sep).join('/')
        : source.startsWith('@engine/') ? 'engine/' + source.slice(8) : source;
      const targetLayer = target.match(/^engine\/(sim|data|api)(?:\/|$)/)?.[1];
      const typebox = /^@sinclair\/typebox(?:\/|$)/.test(source);
      let allowed = typebox;
      if (plugin) allowed ||= source === '@engine/api';
      else if (tool) allowed = !/^engine\/platform(?:\/|$)/.test(target);
      else if (layer === 'sim') allowed ||= targetLayer === 'sim' || targetLayer === 'data' || (targetLayer === 'api' && typeOnly);
      else if (layer === 'data') allowed ||= targetLayer === 'data' || (targetLayer === 'api' && typeOnly);
      else if (layer === 'api') allowed ||= ['sim', 'data', 'api'].includes(targetLayer);
      if (!allowed) context.report({ node, messageId: 'boundary', data: { source } });
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check };
  },
};
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.omc/**', 'docs/**'] },
  ...tseslint.configs.recommended,
  { plugins: { architecture: { rules: { boundary: resolvedBoundary } } }, rules: { 'architecture/boundary': 'error' } },
  { files: ['engine/sim/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [boundary('(?:^|/)(?:platform|tools|packs)(?:/|$)'), boundary('(?:^@engine/api$|(?:^|/)api(?:/|$))', true), boundary(`^(?!${typebox}$|${local}|@engine/(?:sim|data|api)(?:/|$)).*`)] }],
    'no-restricted-properties': ['error', { object: 'Math', property: 'random' }, { object: 'Date', property: 'now' }, { object: 'performance', property: 'now' }],
  } },
  { files: ['engine/data/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [boundary('(?:^|/)(?:sim|platform|tools|packs)(?:/|$)'), boundary('(?:^@engine/api$|(?:^|/)api(?:/|$))', true), boundary(`^(?!${typebox}$|${local}|@engine/(?:data|api)(?:/|$)).*`)] }],
  } },
  { files: ['engine/api/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [boundary(`^(?!${typebox}$|${local}(?!.*platform|.*tools|.*packs)|@engine/(?:sim|data)(?:/|$)).*`)] }],
  } },
  { files: ['packs/*/plugins/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [boundary(`^(?!@engine/api$|${typebox}$).*`)] }],
  } },
  { files: ['tools/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: [boundary('(?:^|/)platform(?:/|$)')] }],
  } },
);
