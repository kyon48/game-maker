export interface Skin {
  font: { family: string; src: string; size: number; lineHeight: number };
  window: { image?: string; slice: number; padding: number };
  colors: { text: string; speaker: string; cursor: string; fade: string };
  message: { rows: number; charsPerTick: number };
}
