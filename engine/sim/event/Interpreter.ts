import type { Command } from '../../data/events';
import type { CommandGen, CommandContext, CommandHost, Wait } from './types';
import type { CommandRegistry } from './CommandRegistry';
export class InterpreterLoopError extends Error {
  constructor() { super('More than 10000 commands in one update'); this.name = 'InterpreterLoopError'; }
}
export class Interpreter {
  private generator: CommandGen | undefined;
  private waiting: Wait | undefined;
  private stopRequested = false;
  private count = 0;
  private depth = 0;
  constructor(private readonly registry: CommandRegistry) {}
  get running(): boolean { return this.generator !== undefined; }
  start(commands: readonly Command[], host: CommandHost): void {
    if (this.running) throw new Error('Interpreter already running');
    this.stopRequested = false; this.depth = 0;
    const isStopped = () => this.stopRequested;
    const context: CommandContext = {
      save: host.save, state: host.state, thisEvent: host.thisEvent,
      get player() { return host.player; },
      waitFrames: host.waitFrames, waitUntil: host.waitUntil,
      showText: host.showText, showChoice: host.showChoice, evaluate: host.evaluate, face: host.face,
      transfer: host.transfer, move: host.move, fade: host.fade, shake: host.shake,
      showCharacter: host.showCharacter, common: host.common, parallel: host.parallel,
      call: id => this.call(id, context),
      get stopped() { return isStopped(); }, stop: () => { this.stopRequested = true; },
      runCommands: list => this.runCommands(list, context),
    };
    this.generator = this.runCommands(commands, context);
  }
  private *call(id: string, context: CommandContext): CommandGen {
    if (++this.depth > 16) { this.depth--; throw new Error('Common event call depth exceeds 16'); }
    try { yield* this.runCommands(context.common(id), context); } finally { this.depth--; }
  }
  private *runCommands(list: readonly Command[], context: CommandContext): CommandGen {
    for (const command of list) {
      if (context.stopped) return;
      if (++this.count > 10000) throw new InterpreterLoopError();
      const result = this.registry.execute(command, context);
      if (result) yield* result;
    }
  }
  update(): void {
    if (!this.generator) return;
    this.count = 0;
    try {
      if (this.waiting) {
        const wait = this.waiting;
        if (wait.kind === 'frames' ? --wait.n > 0 : !wait.test()) return;
        this.waiting = undefined;
      }
      const result = this.generator.next();
      if (result.done) { this.generator = undefined; return; }
      const wait = result.value;
      if (wait.kind === 'frames' && (!Number.isSafeInteger(wait.n) || wait.n < 1)) throw new Error('Invalid frame wait');
      this.waiting = wait.kind === 'frames' ? { ...wait } : wait;
    } catch (error) { this.abort(); throw error; }
  }
  abort(): void {
    try { this.generator?.return(undefined); }
    finally { this.generator = undefined; this.waiting = undefined; this.stopRequested = true; }
  }
}
