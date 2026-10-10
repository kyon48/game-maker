import { Value } from '@sinclair/typebox/value';
import { VoicesSchema } from '../../engine/data/schema/voices';
import type { Voices } from '../../engine/data/schema/voices';
import type { Story } from './ast';
export interface StoryConfig { artRoot?: string; voices?: Voices; narrator?: string }
export function parseStoryConfig(value: unknown): StoryConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('story.config.json은 객체여야 합니다');
  const config = value as Record<string, unknown>;
  if (config.artRoot !== undefined && (typeof config.artRoot !== 'string' || !config.artRoot.trim())) throw new Error('artRoot는 비어 있지 않은 경로여야 합니다');
  if (config.voices !== undefined && !Value.Check(VoicesSchema, config.voices)) throw new Error('voices 설정 형식 오류 (provider, voice, speed 확인)');
  if (config.narrator !== undefined && (typeof config.narrator !== 'string' || !config.narrator.trim())) throw new Error('narrator는 비어 있지 않은 목소리 키여야 합니다');
  return { artRoot: config.artRoot as string | undefined, voices: config.voices as Voices | undefined, narrator: config.narrator as string | undefined };
}
export function storyVoices(stories: readonly Story[], config: StoryConfig): Voices | undefined {
  if (!config.voices) return undefined;
  const voices = new Map<string, Voices[string]>();
  if (config.narrator) voices.set('narrator', config.voices[config.narrator]!);
  for (const character of stories.flatMap(s => s.characters)) if (character.voice) voices.set(character.name, config.voices[character.voice]!);
  return Object.fromEntries([...voices].sort(([a], [b]) => a.localeCompare(b, 'en')));
}
