const logger = require('./logger');

/**
 * Normaliza o payload bruto da Evolution API para um formato canônico.
 *
 * Suporta Evolution API v1 e v2, bem como webhooks via Baileys direto.
 */
function normalizePayload(raw) {
  try {
    const data    = raw?.data || raw;
    const key     = data?.key || {};
    const msgContent = data?.message || {};

    const remoteJid = key?.remoteJid || data?.remoteJid || '';

    // Ignorar grupos
    if (remoteJid.includes('@g.us')) {
      logger.debug('[Normalizer] Mensagem de grupo ignorada:', remoteJid);
      return null;
    }

    // Ignorar mensagens enviadas pelo próprio número
    if (key?.fromMe === true) {
      logger.debug('[Normalizer] Mensagem fromMe ignorada');
      return null;
    }

    const phone     = extractPhone(remoteJid);
    if (!phone) return null;

    const name      = data?.pushName || data?.name || `Contato ${phone}`;
    const message   = extractText(msgContent, data);
    const timestamp = data?.messageTimestamp || data?.timestamp || Math.floor(Date.now() / 1000);
    const messageId = key?.id || `${remoteJid}_${timestamp}`;
    const instanceId = raw?.instance || raw?.instanceName || 'default';

    return { phone, name, message, timestamp, messageId, instanceId, remoteJid };
  } catch (err) {
    logger.error('[Normalizer] Erro:', err.message);
    return null;
  }
}

function extractPhone(remoteJid) {
  if (!remoteJid) return null;
  const digits = remoteJid.split('@')[0].replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
}

function extractText(msgContent, data) {
  return (
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    msgContent?.imageMessage?.caption ||
    msgContent?.videoMessage?.caption ||
    msgContent?.documentMessage?.caption ||
    msgContent?.audioMessage ? '🎤 Áudio' : null ||
    msgContent?.stickerMessage ? '🎭 Sticker' : null ||
    msgContent?.locationMessage ? '📍 Localização' : null ||
    msgContent?.contactMessage ? '👤 Contato compartilhado' : null ||
    data?.body ||
    data?.text ||
    '(mensagem sem texto)'
  );
}

module.exports = { normalizePayload, extractPhone };