export interface NewMessage {
  id: number;
  chat_jid: string;
  sender_jid: string;
  sender_name: string;
  content: string;
  timestamp: string;
  from_assistant: number;
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  requiresTrigger?: boolean;
}

export interface Task {
  id: number;
  group_folder: string;
  chat_jid?: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  status: 'active' | 'paused' | 'completed';
  next_run: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMetadata {
  jid: string;
  name: string;
  last_message_time: string;
}

export interface TaskRunLog {
  id?: number;
  task_id: number;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}
