import { integerScale } from './scale';
/** The same two browser layers supply playback and recording. */
export class Presentation {
  readonly stage = document.createElement('div');
  readonly hd = document.createElement('canvas');
  readonly hdContext: CanvasRenderingContext2D;
  constructor(readonly pixel: HTMLCanvasElement) {
    this.stage.className = 'game-screen'; this.hd.className = 'hd-layer';
    this.stage.append(pixel, this.hd);
    const context = this.hd.getContext('2d');
    if (!context) throw new Error('HD canvas unavailable');
    this.hdContext = context;
  }
  resize(width = window.innerWidth, height = window.innerHeight, pixelRatio = window.devicePixelRatio): void {
    const scale = integerScale(this.pixel.width, this.pixel.height, width, height);
    const w = this.pixel.width * scale, h = this.pixel.height * scale;
    this.stage.style.width = this.pixel.style.width = `${w}px`;
    this.stage.style.height = this.pixel.style.height = `${h}px`;
    this.hd.width = Math.round(w * pixelRatio); this.hd.height = Math.round(h * pixelRatio);
  }
  capture(): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Capture canvas unavailable');
    return context;
  }
  composite(context: CanvasRenderingContext2D): void {
    if (this.pixel.width > context.canvas.width || this.pixel.height > context.canvas.height) throw new Error('Logical screen exceeds recording output');
    const scale = integerScale(this.pixel.width, this.pixel.height, context.canvas.width, context.canvas.height);
    const w = this.pixel.width * scale, h = this.pixel.height * scale;
    const x = Math.floor((context.canvas.width - w) / 2), y = Math.floor((context.canvas.height - h) / 2);
    context.fillStyle = '#000000'; context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.imageSmoothingEnabled = false; context.drawImage(this.pixel, x, y, w, h);
    context.imageSmoothingEnabled = true; context.drawImage(this.hd, x, y, w, h);
  }
}
