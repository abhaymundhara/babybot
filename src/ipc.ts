import fs from 'fs';
import path from 'path';
import { DATA_DIR, IPC_POLL_INTERVAL } from './config.js';
import { logger } from './logger.js';

let ipcWatcherRunning = false;

export function startIpcWatcher(
  onMessage: (groupFolder: string, data: any) => Promise<void>,
): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  logger.info('IPC watcher started');

  const ipcDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcDir, { recursive: true });

  const checkMessages = async () => {
    try {
      // Check for message files in IPC directory
      const groups = fs.readdirSync(ipcDir).filter((name) => {
        const stat = fs.statSync(path.join(ipcDir, name));
        return stat.isDirectory();
      });

      for (const groupFolder of groups) {
        const messagesDir = path.join(ipcDir, groupFolder, 'messages');
        if (!fs.existsSync(messagesDir)) continue;

        const files = fs.readdirSync(messagesDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          const filePath = path.join(messagesDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);

            await onMessage(groupFolder, data);

            // Delete processed file
            fs.unlinkSync(filePath);
            logger.debug({ groupFolder, file }, 'Processed IPC message');
          } catch (error) {
            logger.error({ groupFolder, file, error }, 'Error processing IPC message');
            // Move to error directory
            const errorDir = path.join(ipcDir, groupFolder, 'errors');
            fs.mkdirSync(errorDir, { recursive: true });
            fs.renameSync(filePath, path.join(errorDir, file));
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in IPC watcher loop');
    }
  };

  // Run on interval
  setInterval(checkMessages, IPC_POLL_INTERVAL);
}
