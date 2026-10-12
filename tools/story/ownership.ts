import { object } from './compile';
export interface Manifest { version: 1; files: Record<string, string>; maps: Record<string, string>; expressions?: Record<string, string>; defaultExpressions?: Record<string, string> }
export const ownedPath = /^(audio\.json|items\.json|game\.json|voices\.json|portraits\.json|assets\/portraits\/[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*\.png|common-events\.json|maps\/[a-z][a-z0-9_]*\.events\.json|films\/[a-z][a-z0-9_]*\.(film\.json|narration\.md)|tests\/story_[a-z][a-z0-9_]*\.scenario\.json)$/;
const mapPath = /^maps\/[a-z][a-z0-9_]*\.tmj$/;
export const storyGeneratedPath = /^(films\/[a-z][a-z0-9_]*\.(film\.json|narration\.md)|tests\/story_[a-z][a-z0-9_]*\.scenario\.json)$/;
export function parseManifest(text: string): Manifest {
  const value = object(JSON.parse(text) as unknown);
  if (value.version !== 1 || Object.keys(value).some(key => !['version', 'files', 'maps', 'expressions', 'defaultExpressions'].includes(key))) throw new Error('소유권 매니페스트 버전/필드 오류');
  for (const [field, pattern] of [['files', ownedPath], ['maps', mapPath]] as const) {
    for (const [file, digest] of Object.entries(object(value[field]))) if (!pattern.test(file) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`소유권 경로/해시 오류: ${file}`);
  }
  if (value.expressions !== undefined) for (const [alias, key] of Object.entries(object(value.expressions))) if (!alias || typeof key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('표정 별칭 캐시 오류');
  if (value.defaultExpressions !== undefined) for (const [id, key] of Object.entries(object(value.defaultExpressions))) if (!/^[a-z][a-z0-9_]*$/.test(id) || typeof key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('기본 표정 캐시 오류');
  return value as unknown as Manifest;
}

export const artGeneratedPath = /^(portraits\.json|assets\/portraits\/[a-z][a-z0-9_]*\/[a-z][a-z0-9_]*\.png)$/;
export const artPng = (file: string): boolean => /^assets\/portraits\/.*\.png$/.test(file);
