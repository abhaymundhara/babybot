/**
 * IPC Message Types and Interfaces
 * 
 * Defines the structure of inter-process communication messages
 */

export enum IPCMessageType {
  TASK = 'task',
  COMMAND = 'command',
  RESPONSE = 'response',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
}

export interface IPCMessage {
  id: string;
  type: IPCMessageType;
  groupFolder: string;
  payload: any;
  timestamp: string;
  requiresAck?: boolean;
}

export interface IPCTaskMessage extends IPCMessage {
  type: IPCMessageType.TASK;
  payload: {
    taskId: number;
    prompt: string;
    scheduleType: 'cron' | 'once';
  };
}

export interface IPCCommandMessage extends IPCMessage {
  type: IPCMessageType.COMMAND;
  payload: {
    command: string;
    args: any[];
  };
}

export interface IPCResponseMessage extends IPCMessage {
  type: IPCMessageType.RESPONSE;
  payload: {
    requestId: string;
    success: boolean;
    result?: any;
    error?: string;
  };
}

export interface IPCErrorMessage extends IPCMessage {
  type: IPCMessageType.ERROR;
  payload: {
    error: string;
    stack?: string;
    recoverable: boolean;
  };
}

export interface IPCHeartbeatMessage extends IPCMessage {
  type: IPCMessageType.HEARTBEAT;
  payload: {
    processId: number;
    status: 'active' | 'idle';
  };
}

export type AnyIPCMessage =
  | IPCTaskMessage
  | IPCCommandMessage
  | IPCResponseMessage
  | IPCErrorMessage
  | IPCHeartbeatMessage;
