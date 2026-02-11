import { ChildProcess } from 'child_process';
import { MAX_CONCURRENT_CONTAINERS } from './config.js';
import { logger } from './logger.js';

interface QueuedTask {
  chatJid: string;
  process: () => Promise<boolean>;
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
}

interface ActiveProcess {
  process: ChildProcess | null;
  containerName: string;
  groupFolder: string;
  stdin: any;
}

export class GroupQueue {
  private queue: QueuedTask[] = [];
  private running = 0;
  private activeProcesses: Map<string, ActiveProcess> = new Map();

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

  registerProcess(
    chatJid: string,
    process: ChildProcess | null,
    containerName: string,
    groupFolder: string,
  ): void {
    this.activeProcesses.set(chatJid, {
      process,
      containerName,
      groupFolder,
      stdin: process?.stdin || null,
    });
  }

  closeStdin(chatJid: string): void {
    const activeProcess = this.activeProcesses.get(chatJid);
    if (activeProcess?.stdin && !activeProcess.stdin.destroyed) {
      activeProcess.stdin.end();
      logger.debug({ chatJid }, 'Closed stdin for group process');
    }
  }

  killProcess(chatJid: string): void {
    const activeProcess = this.activeProcesses.get(chatJid);
    if (activeProcess?.process) {
      activeProcess.process.kill();
      this.activeProcesses.delete(chatJid);
      logger.info({ chatJid }, 'Killed process for group');
    }
  }

  getQueueStatus(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length,
    };
  }
}
