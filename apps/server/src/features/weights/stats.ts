/** One-pass mean/variance (Welford) plus min, max, zero and non-finite counts. */
export class StatsAccumulator {
  count = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;
  zeros = 0;
  nonFinite = 0;
  private mean = 0;
  private squares = 0;

  add(value: number): void {
    if (!Number.isFinite(value)) {
      this.nonFinite++;
      return;
    }
    this.count++;
    if (value === 0) this.zeros++;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    this.squares += delta * (value - this.mean);
  }

  summary() {
    const total = this.count + this.nonFinite;
    return {
      count: total,
      min: this.count ? this.min : 0,
      max: this.count ? this.max : 0,
      mean: this.count ? this.mean : 0,
      std: this.count > 1 ? Math.sqrt(this.squares / this.count) : 0,
      zeroFraction: total ? this.zeros / total : 0,
      nonFinite: this.nonFinite,
    };
  }
}

/** Fixed-range histogram; values outside [min, max] land in the edge bins. */
export class Histogram {
  readonly counts: number[];
  private readonly width: number;

  constructor(
    readonly min: number,
    readonly max: number,
    bins: number,
  ) {
    this.counts = Array.from({ length: bins }, () => 0);
    this.width = (max - min) / bins || 1;
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    const index = Math.floor((value - this.min) / this.width);
    const last = this.counts.length - 1;
    const bin = index < 0 ? 0 : index > last ? last : index;
    this.counts[bin] = (this.counts[bin] ?? 0) + 1;
  }
}
