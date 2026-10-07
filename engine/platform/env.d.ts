interface ImportMeta { readonly env: { readonly DEV: boolean } }
declare module 'virtual:pack-runtime' {
  const runtime: import('../data/buildInfo').PackRuntime;
  export default runtime;
}
declare module 'virtual:pack-plugins' {
  const plugins: Record<string, () => Promise<import('../api').PluginModule[]>>;
  export default plugins;
}
