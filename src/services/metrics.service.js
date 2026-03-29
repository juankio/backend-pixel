class MetricsService {
  constructor() {
    this.totalRequests = 0;
    this.successRequests = 0;
    this.failedRequests = 0;
    this.cacheHits = 0;
    this.totalProcessingTimeMs = 0;
  }

  trackStart() {
    this.totalRequests += 1;
    return process.hrtime.bigint();
  }

  trackResult({ startTime, success, cacheHit }) {
    const elapsedNs = process.hrtime.bigint() - startTime;
    const elapsedMs = Number(elapsedNs) / 1_000_000;

    this.totalProcessingTimeMs += elapsedMs;

    if (success) {
      this.successRequests += 1;
    } else {
      this.failedRequests += 1;
    }

    if (cacheHit) {
      this.cacheHits += 1;
    }

    return elapsedMs;
  }

  snapshot() {
    const completed = this.successRequests + this.failedRequests;

    return {
      totalRequests: this.totalRequests,
      successRequests: this.successRequests,
      failedRequests: this.failedRequests,
      cacheHits: this.cacheHits,
      cacheHitRate: this.totalRequests > 0 ? this.cacheHits / this.totalRequests : 0,
      averageProcessingMs: completed > 0 ? this.totalProcessingTimeMs / completed : 0
    };
  }
}

export const metricsService = new MetricsService();
