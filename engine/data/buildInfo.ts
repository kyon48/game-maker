export interface BuildInfo {
  gameId: string; gameVersion: string; engineVersion: string; formatVersion: number;
  apiVersion: number; commit: string; builtAt: string;
}
export interface PackRuntime {
  fixedPackId: string | null; roots: Record<string, string>; inventory: string | null;
  cacheKey: string | null; buildInfo: BuildInfo | null; engineVersion: string;
}
