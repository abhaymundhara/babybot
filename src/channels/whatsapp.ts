import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  isJidGroup,
  delay,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import { logger } from '../logger.js';
import { storeChatMetadata, storeMessage } from '../db.js';

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');

export class WhatsAppChannel {
  private sock: WASocket | null = null;
  private connected = false;

  async connect(
    onMessage: (chatJid: string, senderJid: string, senderName: string, text: string) => Promise<void>,
  ): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const connectSocket = async () => {
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: logger.child({ module: 'baileys' }),
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

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
        }
      });

      this.sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
          if (!msg.message) continue;

          const chatJid = msg.key.remoteJid;
          if (!chatJid) continue;

          const senderJid = msg.key.fromMe ? this.sock?.user?.id || '' : (msg.key.participant || chatJid);
          const text = msg.message.conversation ||
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

          // Store in database
          storeMessage(chatJid, senderJid, pushName, text, timestamp, false);
          storeChatMetadata(chatJid, chatName, timestamp);

          // Don't process our own messages
          if (msg.key.fromMe) continue;

          logger.info(
            { chatJid, sender: pushName, text: text.slice(0, 100) },
            'Received message',
          );

          await onMessage(chatJid, senderJid, pushName, text);
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
      storeMessage(jid, this.sock.user?.id || '', 'Baby', text, timestamp, true);

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
}
