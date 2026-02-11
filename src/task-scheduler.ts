import cronParser from 'cron-parser';
import { SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  getAllTasks,
  logTaskRun,
  markTaskCompleted,
  updateTaskAfterRun,
  updateTaskNextRun,
} from './db.js';
import { logger } from './logger.js';

let schedulerRunning = false;

export function startSchedulerLoop(
  onTask: (task: {
    id: number;
    groupFolder: string;
    prompt: string;
    chatJid?: string;
  }) => Promise<{ result?: string | null } | void>,
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
            const startedAt = Date.now();

            try {
              const execution = await onTask({
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
              updateTaskAfterRun(
                task.id,
                next.toISOString(),
                execution?.result?.slice(0, 500) || 'Completed',
              );
              logTaskRun({
                task_id: task.id,
                run_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'success',
                result: execution?.result || null,
                error: null,
              });
              logger.debug({ taskId: task.id, nextRun: next }, 'Task completed, next run scheduled');
            } catch (error) {
              logTaskRun({
                task_id: task.id,
                run_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'error',
                result: null,
                error: error instanceof Error ? error.message : String(error),
              });
              logger.error({ taskId: task.id, error }, 'Error executing scheduled task');
            }
          }
        } else if (task.schedule_type === 'once' && task.next_run) {
          const nextRun = new Date(task.next_run);
          if (now >= nextRun) {
            logger.info({ taskId: task.id, prompt: task.prompt }, 'Executing one-time task');
            const startedAt = Date.now();

            try {
              const execution = await onTask({
                id: task.id,
                groupFolder: task.group_folder,
                prompt: task.prompt,
                chatJid: task.chat_jid || undefined,
              });

              // Mark as completed
              markTaskCompleted(task.id);
              updateTaskAfterRun(
                task.id,
                null,
                execution?.result?.slice(0, 500) || 'Completed',
              );
              logTaskRun({
                task_id: task.id,
                run_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'success',
                result: execution?.result || null,
                error: null,
              });
              logger.debug({ taskId: task.id }, 'One-time task completed');
            } catch (error) {
              logTaskRun({
                task_id: task.id,
                run_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'error',
                result: null,
                error: error instanceof Error ? error.message : String(error),
              });
              logger.error({ taskId: task.id, error }, 'Error executing one-time task');
            }
          }
        } else if (task.schedule_type === 'interval' && task.next_run) {
          const nextRun = new Date(task.next_run);
          if (now >= nextRun) {
            logger.info({ taskId: task.id, prompt: task.prompt }, 'Executing interval task');
            const startedAt = Date.now();

            try {
              const execution = await onTask({
                id: task.id,
                groupFolder: task.group_folder,
                prompt: task.prompt,
                chatJid: task.chat_jid || undefined,
              });

              const intervalMs = parseInt(task.schedule_value, 10);
              if (!Number.isNaN(intervalMs) && intervalMs > 0) {
                const next = new Date(Date.now() + intervalMs);
                updateTaskNextRun(task.id, next.toISOString());
                updateTaskAfterRun(
                  task.id,
                  next.toISOString(),
                  execution?.result?.slice(0, 500) || 'Completed',
                );
                logTaskRun({
                  task_id: task.id,
                  run_at: new Date().toISOString(),
                  duration_ms: Date.now() - startedAt,
                  status: 'success',
                  result: execution?.result || null,
                  error: null,
                });
                logger.debug({ taskId: task.id, nextRun: next }, 'Interval task completed, next run scheduled');
              } else {
                logger.warn(
                  { taskId: task.id, scheduleValue: task.schedule_value },
                  'Invalid interval value, marking task completed',
                );
                markTaskCompleted(task.id);
                updateTaskAfterRun(task.id, null, 'Invalid interval value');
              }
            } catch (error) {
              logTaskRun({
                task_id: task.id,
                run_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                status: 'error',
                result: null,
                error: error instanceof Error ? error.message : String(error),
              });
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
