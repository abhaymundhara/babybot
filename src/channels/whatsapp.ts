import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  isJidGroup,
} from '@whiskeysockets/baileys';
import path from 'path';
import { ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';
import {
  getRouterState,
  setRouterState,
  storeChatMetadata,
  storeMessage,
} from '../db.js';
import { renderQrInTerminal } from '../qr-terminal.js';

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');
const GROUP_SYNC_KEY = 'whatsapp_group_sync_last';
const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class WhatsAppChannel {
  private sock: WASocket | null = null;
  private connected = false;
  private groupSyncTimerStarted = false;

  async connect(
    onMessage: (
      chatJid: string,
      senderJid: string,
      senderName: string,
      text: string,
      chatName: string,
    ) => Promise<void>,
  ): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const connectSocket = async () => {
      this.sock = makeWASocket({
        auth: state,
        logger: logger.child({ module: 'baileys' }),
      });

      this.sock.ev.on('creds.update', saveCreds);
      let lastQr = '';

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && qr !== lastQr) {
          lastQr = qr;
          logger.info('Scan this QR code with WhatsApp > Linked Devices:');
          const rendered = await renderQrInTerminal(qr);
          console.log(rendered);
        }

        if (connection === 'close') {
          this.connected = false;
          const shouldReconnect =
            (lastDisconnect?.error as any)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          logger.info(
            { shouldReconnect, error: lastDisconnect?.error },
            'Connection closed',
          );

          if (shouldReconnect) {
            setTimeout(connectSocket, 5000);
          }
        } else if (connection === 'open') {
          logger.info('WhatsApp connected');
          this.connected = true;

          this.syncGroupMetadata().catch((error) => {
            logger.warn(
              { error },
              'Initial WhatsApp group metadata sync failed',
            );
          });

          if (!this.groupSyncTimerStarted) {
            this.groupSyncTimerStarted = true;
            setInterval(() => {
              this.syncGroupMetadata().catch((error) => {
                logger.warn(
                  { error },
                  'Periodic WhatsApp group metadata sync failed',
                );
              });
            }, GROUP_SYNC_INTERVAL_MS);
          }
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
          if (!msg.message) continue;

          const chatJid = msg.key.remoteJid;
          if (!chatJid) continue;

          const senderJid = msg.key.fromMe
            ? this.sock?.user?.id || ''
            : msg.key.participant || chatJid;
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

          if (!text) continue;

          // Get sender name
          const pushName = msg.pushName || 'Unknown';

          // Get chat name
          let chatName = pushName;
          if (isJidGroup(chatJid)) {
            try {
              const groupMetadata = await this.sock?.groupMetadata(chatJid);
              chatName = groupMetadata?.subject || chatJid;
            } catch (error) {
              logger.warn({ chatJid, error }, 'Failed to get group metadata');
            }
          }

          const timestamp = new Date(
            (msg.messageTimestamp as number) * 1000,
          ).toISOString();

          // Store in database - fromMe messages are from the assistant
          const fromAssistant = msg.key.fromMe || false;
          const senderName = fromAssistant ? ASSISTANT_NAME : pushName;
          storeMessage(
            chatJid,
            senderJid,
            senderName,
            text,
            timestamp,
            fromAssistant,
          );
          storeChatMetadata(chatJid, chatName, timestamp);

          // Don't process our own messages
          if (msg.key.fromMe) continue;

          logger.info(
            { chatJid, sender: pushName, text: text.slice(0, 100) },
            'Received message',
          );

          await onMessage(chatJid, senderJid, pushName, text, chatName);
        }
      });
    };

    await connectSocket();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock || !this.connected) {
      logger.warn({ jid }, 'Cannot send message: not connected');
      return;
    }

    try {
      await this.sock.sendMessage(jid, { text });

      // Store our message in database
      const timestamp = new Date().toISOString();
      storeMessage(
        jid,
        this.sock.user?.id || '',
        ASSISTANT_NAME,
        text,
        timestamp,
        true,
      );

      logger.info({ jid, text: text.slice(0, 100) }, 'Sent message');
    } catch (error) {
      logger.error({ jid, error }, 'Failed to send message');
    }
  }

  async setTyping(jid: string, typing: boolean): Promise<void> {
    if (!this.sock || !this.connected) return;

    try {
      if (typing) {
        await this.sock.sendPresenceUpdate('composing', jid);
      } else {
        await this.sock.sendPresenceUpdate('paused', jid);
      }
    } catch (error) {
      logger.debug({ jid, error }, 'Failed to set typing status');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async syncGroupMetadata(force = false): Promise<void> {
    if (!this.sock || !this.connected) return;

    if (!force) {
      const lastSync = getRouterState(GROUP_SYNC_KEY);
      if (lastSync) {
        const elapsed = Date.now() - new Date(lastSync).getTime();
        if (elapsed < GROUP_SYNC_INTERVAL_MS) {
          return;
        }
      }
    }

    logger.info('Syncing WhatsApp group metadata');
    const groups = await this.sock.groupFetchAllParticipating();
    const now = new Date().toISOString();

    for (const [jid, metadata] of Object.entries(groups)) {
      const chatName = metadata?.subject || jid;
      storeChatMetadata(jid, chatName, now);
    }

    setRouterState(GROUP_SYNC_KEY, now);
    logger.info(
      { groupCount: Object.keys(groups).length },
      'WhatsApp group metadata synced',
    );
  }
}
