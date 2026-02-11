import cronParser from 'cron-parser';
import { SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import { getAllTasks, updateTaskNextRun, markTaskCompleted } from './db.js';
import { logger } from './logger.js';

let schedulerRunning = false;

export function startSchedulerLoop(
  onTask: (task: {
    id: number;
    groupFolder: string;
    prompt: string;
    chatJid?: string;
  }) => Promise<void>,
): void {
  if (schedulerRunning) {
    logger.debug('Scheduler already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;

  logger.info('Task scheduler started');

  const checkTasks = async () => {
    try {
      const tasks = getAllTasks();
      const now = new Date();

      for (const task of tasks) {
        if (task.status !== 'active') continue;

        if (task.schedule_type === 'cron' && task.next_run) {
          const nextRun = new Date(task.next_run);
          if (now >= nextRun) {
            logger.info({ taskId: task.id, prompt: task.prompt }, 'Executing scheduled task');

            try {
              await onTask({
                id: task.id,
                groupFolder: task.group_folder,
                prompt: task.prompt,
                chatJid: task.chat_jid || undefined,
              });

              // Calculate next run
              const interval = cronParser.parse(task.schedule_value, {
                currentDate: now,
                tz: TIMEZONE,
              });
              const next = interval.next().toDate();

              // Update next_run in database
              updateTaskNextRun(task.id, next.toISOString());
              logger.debug({ taskId: task.id, nextRun: next }, 'Task completed, next run scheduled');
            } catch (error) {
              logger.error({ taskId: task.id, error }, 'Error executing scheduled task');
            }
          }
        } else if (task.schedule_type === 'once' && task.next_run) {
          const nextRun = new Date(task.next_run);
          if (now >= nextRun) {
            logger.info({ taskId: task.id, prompt: task.prompt }, 'Executing one-time task');

            try {
              await onTask({
                id: task.id,
                groupFolder: task.group_folder,
                prompt: task.prompt,
                chatJid: task.chat_jid || undefined,
              });

              // Mark as completed
              markTaskCompleted(task.id);
              logger.debug({ taskId: task.id }, 'One-time task completed');
            } catch (error) {
              logger.error({ taskId: task.id, error }, 'Error executing one-time task');
            }
          }
        } else if (task.schedule_type === 'interval' && task.next_run) {
          const nextRun = new Date(task.next_run);
          if (now >= nextRun) {
            logger.info({ taskId: task.id, prompt: task.prompt }, 'Executing interval task');

            try {
              await onTask({
                id: task.id,
                groupFolder: task.group_folder,
                prompt: task.prompt,
                chatJid: task.chat_jid || undefined,
              });

              const intervalMs = parseInt(task.schedule_value, 10);
              if (!Number.isNaN(intervalMs) && intervalMs > 0) {
                const next = new Date(Date.now() + intervalMs);
                updateTaskNextRun(task.id, next.toISOString());
                logger.debug({ taskId: task.id, nextRun: next }, 'Interval task completed, next run scheduled');
              } else {
                logger.warn(
                  { taskId: task.id, scheduleValue: task.schedule_value },
                  'Invalid interval value, marking task completed',
                );
                markTaskCompleted(task.id);
              }
            } catch (error) {
              logger.error({ taskId: task.id, error }, 'Error executing interval task');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error in scheduler loop');
    }
  };

  // Run immediately
  checkTasks();

  // Then run on interval
  setInterval(checkTasks, SCHEDULER_POLL_INTERVAL);
}
