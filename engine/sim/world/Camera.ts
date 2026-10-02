export interface Point { readonly x: number; readonly y: number }
export interface Size { readonly width: number; readonly height: number }
export function camera(target: Point, map: Size, screen: Size, shake: Point = { x: 0, y: 0 }): Point {
  const axis = (position: number, extent: number, viewport: number) => extent < viewport
    ? (extent - viewport) / 2
    : Math.max(0, Math.min(extent - viewport, position - viewport / 2));
  return { x: axis(target.x, map.width, screen.width) + shake.x,
    y: axis(target.y, map.height, screen.height) + shake.y };
}
