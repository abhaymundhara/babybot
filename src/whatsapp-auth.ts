import 'dotenv/config';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import path from 'path';
import { logger } from './logger.js';

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');

async function authenticate() {
  logger.info('Starting WhatsApp authentication...');
  logger.info('Scan the QR code with your WhatsApp mobile app');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection } = update;

    if (connection === 'open') {
      logger.info('✓ Successfully authenticated!');
      logger.info('You can now close this and run: npm start');
      process.exit(0);
    }
  });
}

authenticate().catch((error) => {
  logger.error({ error }, 'Authentication failed');
  process.exit(1);
});
