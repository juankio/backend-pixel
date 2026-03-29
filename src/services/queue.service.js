import os from 'node:os';
import PQueue from 'p-queue';
import env from '../config/env.js';

const cpuBasedConcurrency = Math.max(2, Math.floor(os.cpus().length / 2));
const concurrency = Math.max(1, env.PROCESS_CONCURRENCY || cpuBasedConcurrency);

class ProcessingQueueService {
  constructor() {
    this.queue = new PQueue({ concurrency });
  }

  add(task) {
    return this.queue.add(task);
  }

  stats() {
    return {
      concurrency,
      pending: this.queue.pending,
      size: this.queue.size,
      isPaused: this.queue.isPaused
    };
  }
}

export const processingQueueService = new ProcessingQueueService();
