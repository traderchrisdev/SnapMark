/** Step timer: mark(step) records the time since the previous mark; summary() is one log line. */
export class StepTimer {
  private readonly start: number;
  private last: number;
  private readonly steps: Array<[string, number]> = [];

  constructor(private readonly now: () => number = Date.now) {
    this.start = now();
    this.last = this.start;
  }

  mark(step: string): void {
    const t = this.now();
    this.steps.push([step, t - this.last]);
    this.last = t;
  }

  elapsed(): number {
    return this.now() - this.start;
  }

  summary(): string {
    return `${this.steps.map(([s, ms]) => `${s} ${ms}`).join(' | ')} | total ${this.elapsed()} ms`;
  }
}
