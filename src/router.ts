import { ASSISTANT_NAME } from './config.js';
import { NewMessage } from './types.js';

export function formatMessages(messages: NewMessage[]): string {
  const formatted = messages.map((m) => {
    const sender = m.from_assistant ? ASSISTANT_NAME : m.sender_name;
    return `${sender}: ${m.content}`;
  });

  return formatted.join('\n');
}

export function formatOutbound(text: string): string {
  return `${ASSISTANT_NAME}: ${text}`;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
