export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'cancel';
export interface InputFrame {
  held: ReadonlySet<Action>;
  pressed: ReadonlySet<Action>; // 삽입 순서 = 틱 사이의 마지막 keydown 순서
}
export interface TextMeasurer { width(text: string): number }
export interface PackSource {
  readJson(path: string): Promise<unknown>;
  listFiles?(): Promise<readonly string[]>;
  exists(path: string): Promise<boolean>;
}
