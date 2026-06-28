export class AITokenManager {
  private calls: number[] = [];

  constructor(private readonly now = () => Date.now()) {}

  canCall(limitPerMinute: number): boolean {
    this.prune();
    return this.calls.length < limitPerMinute;
  }

  recordCall(): void {
    this.prune();
    this.calls.push(this.now());
  }

  nextAvailableInMs(limitPerMinute: number): number {
    this.prune();
    if (this.calls.length < limitPerMinute) return 0;
    const oldest = this.calls[0] ?? this.now();
    return Math.max(0, 60_000 - (this.now() - oldest));
  }

  private prune(): void {
    const cutoff = this.now() - 60_000;
    this.calls = this.calls.filter((timestamp) => timestamp > cutoff);
  }
}
