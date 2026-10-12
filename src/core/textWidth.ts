/**
 * Text width is linear in font size, so measure each string once at a large reference size and
 * scale. Labels are drawn at a size that eases with the camera zoom, so measuring "at the current
 * size" would re-measure every label every frame.
 */
export class TextWidthCache {
  private cache = new Map<string, number>();

  constructor(private measureAtReference: (text: string) => number, private referencePx = 100) {}

  width(text: string, px: number): number {
    let w = this.cache.get(text);
    if (w === undefined) {
      w = this.measureAtReference(text);
      this.cache.set(text, w);
    }
    return (w * px) / this.referencePx;
  }

  clear() {
    this.cache.clear();
  }
}
