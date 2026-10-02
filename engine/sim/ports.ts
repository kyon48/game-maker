export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'cancel';
export interface InputFrame {
  held: ReadonlySet<Action>;
  pressed: ReadonlySet<Action>;
}
export interface TextMeasurer { width(text: string): number }
export interface PackSource {
  readJson(path: string): Promise<unknown>;
  exists(path: string): Promise<boolean>;
}
