interface ImportMeta { readonly env: { readonly DEV: boolean } }
declare module 'virtual:pack-runtime' {
  const runtime: import('../data/buildInfo').PackRuntime;
  export default runtime;
}
