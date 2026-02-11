import cronParser from 'cron-parser';
import { TIMEZONE } from './config.js';

export type ScheduleType = 'cron' | 'interval' | 'once';

export function computeNextRun(
  scheduleType: ScheduleType,
  scheduleValue: string,
): string | null {
  if (scheduleType === 'cron') {
    try {
      return cronParser
        .parse(scheduleValue, { tz: TIMEZONE })
        .next()
        .toDate()
        .toISOString();
    } catch {
      return null;
    }
  }

  if (scheduleType === 'interval') {
    const intervalMs = Number.parseInt(scheduleValue, 10);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return null;
    }
    return new Date(Date.now() + intervalMs).toISOString();
  }

  const date = new Date(scheduleValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}
