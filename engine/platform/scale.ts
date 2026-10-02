export function integerScale(width: number, height: number, availableWidth: number, availableHeight: number): number {
  return Math.max(1, Math.floor(Math.min(availableWidth / width, availableHeight / height)));
}
export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const scale = integerScale(canvas.width, canvas.height, window.innerWidth, window.innerHeight);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}
