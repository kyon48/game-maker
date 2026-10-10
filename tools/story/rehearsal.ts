/** Authored films can warn; generated story films must alternate narration and dialogue. */
export function assertNoStoryVoiceOverlap(warnings: readonly string[]): void {
  const overlaps = warnings.filter(warning => warning.startsWith('Narration overlaps voiced dialogue'));
  if (overlaps.length) throw new Error(`S037 생성 촬영 대본에서 나레이션과 대사 음성이 겹칩니다:\n${overlaps.join('\n')}`);
}
