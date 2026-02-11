import 'dotenv/config';
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import path from 'path';
import { logger } from './logger.js';
import { renderQrInTerminal } from './qr-terminal.js';

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');

async function authenticate() {
  logger.info('Starting WhatsApp authentication...');
  logger.info('Waiting for QR code...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);
  let lastQr = '';

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr && qr !== lastQr) {
      lastQr = qr;
      logger.info('Scan this QR code with WhatsApp > Linked Devices:');
      const rendered = await renderQrInTerminal(qr);
      console.log(rendered);
    }

    if (connection === 'open') {
      logger.info('✓ Successfully authenticated!');
      logger.info('You can now close this and run: npm start');
      process.exit(0);
    }

    if (connection === 'close') {
      logger.error('Connection closed before authentication completed. Re-run: npm run auth');
      process.exit(1);
    }
  });
}

authenticate().catch((error) => {
  logger.error({ error }, 'Authentication failed');
  process.exit(1);
});
