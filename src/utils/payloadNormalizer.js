const { extractInstanceId } = require('../services/evolutionService');
const logger = require('./logger');

function normalizePayload(rawPayload) {
  try {
    const instanceId = extractInstanceId(rawPayload);

    let messageData;

    // 🔥 Compatível com todos formatos
    if (rawPayload?.data?.messages?.length) {
      messageData = rawPayload.data.messages[0];
    } else if (rawPayload?.data?.key) {
      messageData = rawPayload.data;
    } else {
      logger.warn('[Normalizer] Nenhuma mensagem encontrada');
      return null;
    }

    const key = messageData?.key || {};
    const msgContent = messageData?.message || {};

    const remoteJid = key?.remoteJid || '';

    // 🚫 Ignorar grupo
    if (remoteJid.includes('@g.us')) {
      logger.info('[Normalizer] Grupo ignorado:', remoteJid);
      return null;
    }

    const phone = extractPhone(remoteJid);
    if (!phone) return null;

    const name =
      messageData?.pushName ||
      messageData?.notifyName ||
      `Contato ${phone}`;

    const message = extractMessageText(msgContent);
    if (!message) return null;

    const messageId = key?.id || `${phone}-${Date.now()}`;

    return {
      phone,
      name,
      message,
      instanceId,
      messageId,
    };

  } catch (error) {
    logger.error('[Normalizer] Erro:', error.message);
    return null;
  }
}

function extractPhone(remoteJid) {
  if (!remoteJid) return null;

  const raw = remoteJid.split('@')[0];
  const digits = raw.replace(/\D/g, '');

  if (!digits || digits.length < 8) return null;

  if (digits.startsWith('55')) return `+${digits}`;

  return `+55${digits}`;
}

function extractMessageText(msg) {
  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    msg?.buttonsResponseMessage?.selectedDisplayText ||
    msg?.listResponseMessage?.title ||
    ''
  );
}

module.exports = { normalizePayload };