import { MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';

interface QueuedTask {
  chatJid: string;
  process: () => Promise<boolean>;
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
}

export class GroupQueue {
  private queue: QueuedTask[] = [];
  private running = 0;

  async enqueue(chatJid: string, process: () => Promise<boolean>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({ chatJid, process, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running >= MAX_CONCURRENT_CONTAINERS || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;
    logger.debug(
      { chatJid: task.chatJid, running: this.running, queued: this.queue.length },
      'Processing group task',
    );

    try {
      const result = await task.process();
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      this.processNext();
    }
  }

  getQueueStatus(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length,
    };
  }
}
