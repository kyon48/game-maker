/** Fixed uint32 LCG; persisted independently of scene state. */
export class Random {
  constructor(public state = 1) {}
  next(): number { this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0; return this.state / 4294967296; }
}
