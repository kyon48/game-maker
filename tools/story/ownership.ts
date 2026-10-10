import { object } from './compile';
export interface Manifest { version: 1; files: Record<string, string>; maps: Record<string, string> }
export const ownedPath = /^(game\.json|voices\.json|common-events\.json|maps\/[a-z][a-z0-9_]*\.events\.json|films\/[a-z][a-z0-9_]*\.(film\.json|narration\.md)|tests\/story_[a-z][a-z0-9_]*\.scenario\.json)$/;
const mapPath = /^maps\/[a-z][a-z0-9_]*\.tmj$/;
export const storyGeneratedPath = /^(films\/[a-z][a-z0-9_]*\.(film\.json|narration\.md)|tests\/story_[a-z][a-z0-9_]*\.scenario\.json)$/;
export function parseManifest(text: string): Manifest {
  const value = object(JSON.parse(text) as unknown);
  if (value.version !== 1 || Object.keys(value).some(key => !['version', 'files', 'maps'].includes(key))) throw new Error('소유권 매니페스트 버전/필드 오류');
  for (const [field, pattern] of [['files', ownedPath], ['maps', mapPath]] as const) {
    for (const [file, digest] of Object.entries(object(value[field]))) if (!pattern.test(file) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`소유권 경로/해시 오류: ${file}`);
  }
  return value as unknown as Manifest;
}
