import QRCode from 'qrcode';

export async function renderQrInTerminal(qr: string): Promise<string> {
  return QRCode.toString(qr, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
  });
}
