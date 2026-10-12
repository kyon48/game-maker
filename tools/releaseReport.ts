import type { FramedEvent } from '../engine/film/timeline';
export interface Measurement { duration: number; lufs: number | null; peak: number | null }
export function description(template: string, values: { title: string; chapters: string; credits: string; duration: string }): string {
  return template.replace(/\{(title|chapters|credits|duration)\}/g, (_, key: keyof typeof values) => values[key]);
}
export function review(input: { measurement: Measurement; targetMinutes?: number; events: readonly FramedEvent[]; fps: number; warnings: readonly string[]; placeholders: readonly string[]; credits: string; voices: ReadonlySet<string> }): string {
  const { measurement: m } = input, texts = input.events.filter(e => e.type === 'text-start'), chapters = input.events.filter(e => e.type === 'chapter');
  const missingVoices = [...new Set(texts.filter(e => !input.voices.has(e.speaker ?? 'narrator')).map(e => e.speaker ?? 'narrator'))];
  return ['# 납품 검수', '', `- 총 길이: ${m.duration.toFixed(3)}초`, `- 목표 길이: ${input.targetMinutes === undefined ? '미설정' : `${input.targetMinutes}분 (차이 ${(m.duration / 60 - input.targetMinutes).toFixed(2)}분)`}`, `- 통합 음량: ${m.lufs ?? '무음/측정 불가'} LUFS`, `- 최대 피크: ${m.peak ?? '무음/측정 불가'} dBTP`, `- 얼굴 없는 대사: ${texts.filter(e => !e.portrait || !e.expression).length}/${texts.length}`, `- 목소리 없는 화자: ${missingVoices.join(', ') || '없음'}`, `- 플레이스홀더 인물: ${input.placeholders.join(', ') || '없음'}`, `- 출처 빈 칸: ${(input.credits.match(/\{[^}]+\}/g) ?? []).join(', ') || '없음'}`, '', '## 장별 길이', '', ...chapters.map((e, i) => `- ${e.title}: ${Number((((chapters[i + 1]?.frame ?? m.duration * input.fps) - e.frame) / input.fps).toFixed(3))}초`), '', '## 경고', '', ...(input.warnings.length ? input.warnings.map(w => '- ' + w) : ['- 없음']), '', '## 사람 검수', '', '- [ ] 맞춤법·발음·자막', '- [ ] 저작권·번역본 사용 권한·2차 창작 표기', '- [ ] 원작·자료 출처와 CREDITS 빈 칸', '- [ ] 얼굴·플레이스홀더·장면 전환', '- [ ] 썸네일·제목·설명란', '- [ ] 유튜브 합성 콘텐츠 표기 확인', ''].join('\n');
}
