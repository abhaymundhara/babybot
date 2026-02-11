/**
 * Enhanced IPC System
 * 
 * Real-time file watching, message acknowledgment, error recovery
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';
import { AnyIPCMessage, IPCMessage, IPCMessageType } from './ipc-types.js';

const IPC_DIR = path.join(DATA_DIR, 'ipc');
const ACK_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

interface PendingMessage {
  message: IPCMessage;
  retries: number;
  timeout: NodeJS.Timeout;
}

export class EnhancedIPCSystem {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private pendingAcks: Map<string, PendingMessage> = new Map();
  private running = false;
  private messageHandlers: Map<
    IPCMessageType,
    (message: AnyIPCMessage) => Promise<void>
  > = new Map();

  constructor() {
    fs.mkdirSync(IPC_DIR, { recursive: true });
  }

  /**
   * Register a message handler for a specific type
   */
  registerHandler(
    type: IPCMessageType,
    handler: (message: AnyIPCMessage) => Promise<void>,
  ): void {
    this.messageHandlers.set(type, handler);
    logger.debug({ type }, 'IPC handler registered');
  }

  /**
   * Start watching for IPC messages
   */
  start(): void {
    if (this.running) {
      logger.debug('IPC system already running');
      return;
    }

    this.running = true;
    logger.info('Enhanced IPC system started');

    // Watch for new group folders
    this.watchDirectory(IPC_DIR, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const groupPath = path.join(IPC_DIR, filename);
        if (fs.existsSync(groupPath) && fs.statSync(groupPath).isDirectory()) {
          this.setupGroupWatcher(filename);
        }
      }
    });

    // Setup watchers for existing groups
    const existingGroups = fs.readdirSync(IPC_DIR).filter((name) => {
      const groupPath = path.join(IPC_DIR, name);
      return fs.statSync(groupPath).isDirectory();
    });

    for (const groupFolder of existingGroups) {
      this.setupGroupWatcher(groupFolder);
    }
  }

  /**
   * Stop the IPC system
   */
  stop(): void {
    this.running = false;

    // Close all watchers
    for (const [group, watcher] of this.watchers) {
      watcher.close();
      logger.debug({ group }, 'Closed IPC watcher');
    }
    this.watchers.clear();

    // Clear pending acks
    for (const [id, pending] of this.pendingAcks) {
      clearTimeout(pending.timeout);
    }
    this.pendingAcks.clear();

    logger.info('Enhanced IPC system stopped');
  }

  /**
   * Send an IPC message
   */
  async sendMessage(message: IPCMessage): Promise<void> {
    const messageDir = path.join(IPC_DIR, message.groupFolder, 'messages');
    fs.mkdirSync(messageDir, { recursive: true });

    const messageFile = path.join(messageDir, `${message.id}.json`);
    const content = JSON.stringify(message, null, 2);

    try {
      fs.writeFileSync(messageFile, content);
      logger.debug({ messageId: message.id, type: message.type }, 'IPC message sent');

      // Track for acknowledgment if required
      if (message.requiresAck) {
        this.trackForAck(message);
      }
    } catch (error) {
      logger.error({ error, messageId: message.id }, 'Failed to send IPC message');
      throw error;
    }
  }

  /**
   * Create and send a message
   */
  async send(
    groupFolder: string,
    type: IPCMessageType,
    payload: any,
    requiresAck = false,
  ): Promise<string> {
    const message: IPCMessage = {
      id: uuidv4(),
      type,
      groupFolder,
      payload,
      timestamp: new Date().toISOString(),
      requiresAck,
    };

    await this.sendMessage(message);
    return message.id;
  }

  /**
   * Send acknowledgment for a message
   */
  async sendAck(messageId: string, groupFolder: string): Promise<void> {
    const ackDir = path.join(IPC_DIR, groupFolder, 'acks');
    fs.mkdirSync(ackDir, { recursive: true });

    const ackFile = path.join(ackDir, `${messageId}.ack`);
    fs.writeFileSync(ackFile, new Date().toISOString());

    logger.debug({ messageId }, 'ACK sent');
  }

  /**
   * Setup watcher for a specific group
   */
  private setupGroupWatcher(groupFolder: string): void {
    if (this.watchers.has(groupFolder)) {
      return; // Already watching
    }

    const messagesDir = path.join(IPC_DIR, groupFolder, 'messages');
    fs.mkdirSync(messagesDir, { recursive: true });

    // Watch the messages directory
    const watcher = this.watchDirectory(messagesDir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.json')) {
        this.processMessage(groupFolder, filename).catch((error) => {
          logger.error({ groupFolder, filename, error }, 'Error processing IPC message');
        });
      }
    });

    this.watchers.set(groupFolder, watcher);

    // Also watch for acks
    const acksDir = path.join(IPC_DIR, groupFolder, 'acks');
    fs.mkdirSync(acksDir, { recursive: true });

    this.watchDirectory(acksDir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.ack')) {
        const messageId = filename.replace('.ack', '');
        this.handleAck(messageId);
      }
    });

    logger.info({ groupFolder }, 'IPC watcher setup for group');
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(
    dir: string,
    callback: (eventType: string, filename: string | null) => void,
  ): fs.FSWatcher {
    return fs.watch(dir, { persistent: true }, (eventType, filename) => {
      try {
        callback(eventType, filename);
      } catch (error) {
        logger.error({ dir, error }, 'Error in directory watcher callback');
      }
    });
  }

  /**
   * Process an incoming message
   */
  private async processMessage(
    groupFolder: string,
    filename: string,
  ): Promise<void> {
    const filePath = path.join(IPC_DIR, groupFolder, 'messages', filename);

    // Wait a bit for file to be fully written
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!fs.existsSync(filePath)) {
      return; // File already processed or deleted
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const message = JSON.parse(content) as AnyIPCMessage;

      logger.debug(
        { messageId: message.id, type: message.type, groupFolder },
        'Processing IPC message',
      );

      // Get handler for this message type
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        await handler(message);
      } else {
        logger.warn({ type: message.type }, 'No handler registered for message type');
      }

      // Send acknowledgment if required
      if (message.requiresAck) {
        await this.sendAck(message.id, groupFolder);
      }

      // Delete processed message
      fs.unlinkSync(filePath);
      logger.debug({ messageId: message.id }, 'IPC message processed');
    } catch (error) {
      logger.error({ groupFolder, filename, error }, 'Error processing IPC message');

      // Move to error directory for manual inspection
      const errorDir = path.join(IPC_DIR, groupFolder, 'errors');
      fs.mkdirSync(errorDir, { recursive: true });
      const errorFile = path.join(errorDir, `${Date.now()}-${filename}`);

      try {
        fs.renameSync(filePath, errorFile);
      } catch (moveError) {
        logger.error({ moveError }, 'Failed to move error file');
      }
    }
  }

  /**
   * Track message for acknowledgment
   */
  private trackForAck(message: IPCMessage): void {
    const timeout = setTimeout(() => {
      this.handleAckTimeout(message.id);
    }, ACK_TIMEOUT);

    this.pendingAcks.set(message.id, {
      message,
      retries: 0,
      timeout,
    });
  }

  /**
   * Handle acknowledgment timeout
   */
  private async handleAckTimeout(messageId: string): Promise<void> {
    const pending = this.pendingAcks.get(messageId);
    if (!pending) return;

    logger.warn({ messageId, retries: pending.retries }, 'ACK timeout');

    if (pending.retries < MAX_RETRIES) {
      // Retry sending the message
      pending.retries++;
      logger.info({ messageId, retry: pending.retries }, 'Retrying IPC message');

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));

      try {
        await this.sendMessage(pending.message);
        this.trackForAck(pending.message);
      } catch (error) {
        logger.error({ messageId, error }, 'Failed to retry IPC message');
      }
    } else {
      // Max retries reached, give up
      logger.error({ messageId }, 'Max retries reached for IPC message');
      this.pendingAcks.delete(messageId);

      // Trigger error handler if registered
      const errorHandler = this.messageHandlers.get(IPCMessageType.ERROR);
      if (errorHandler) {
        await errorHandler({
          id: uuidv4(),
          type: IPCMessageType.ERROR,
          groupFolder: pending.message.groupFolder,
          payload: {
            error: `Message ${messageId} failed after ${MAX_RETRIES} retries`,
            recoverable: false,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Handle received acknowledgment
   */
  private handleAck(messageId: string): void {
    const pending = this.pendingAcks.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(messageId);
      logger.debug({ messageId }, 'ACK received');
    }
  }
}

// Singleton instance
let ipcSystemInstance: EnhancedIPCSystem | null = null;

/**
 * Get or create the IPC system instance
 */
export function getIPCSystem(): EnhancedIPCSystem {
  if (!ipcSystemInstance) {
    ipcSystemInstance = new EnhancedIPCSystem();
  }
  return ipcSystemInstance;
}

/**
 * Start enhanced IPC watcher (replaces old polling-based system)
 */
export function startEnhancedIPC(
  onMessage: (groupFolder: string, data: any) => Promise<void>,
): void {
  const ipc = getIPCSystem();

  // Register generic message handler
  ipc.registerHandler(IPCMessageType.TASK, async (message) => {
    await onMessage(message.groupFolder, message.payload);
  });

  ipc.registerHandler(IPCMessageType.COMMAND, async (message) => {
    await onMessage(message.groupFolder, message.payload);
  });

  ipc.start();
}
