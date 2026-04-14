const { extractInstanceId } = require('../services/evolutionService');
const logger = require('./logger');

function normalizePayload(rawPayload) {
  try {
    const instanceId = extractInstanceId(rawPayload);

    // 🔥 CORREÇÃO PRINCIPAL → acessar messages[0]
    const messageData = rawPayload?.data?.messages?.[0];

    if (!messageData) {
      logger.warn('[Normalizer] Nenhuma mensagem encontrada no payload');
      return null;
    }

    const key = messageData?.key || {};
    const msgContent = messageData?.message || {};

    const remoteJid = key?.remoteJid || '';

    // 🚫 Ignorar grupos
    if (remoteJid.includes('@g.us')) {
      logger.info('[Normalizer] Mensagem de grupo ignorada:', remoteJid);
      return null;
    }

    // 📞 Telefone
    const phone = extractPhone(remoteJid);
    if (!phone) {
      logger.warn('[Normalizer] Não foi possível extrair telefone:', remoteJid);
      return null;
    }

    // 👤 Nome
    const name =
      messageData?.pushName ||
      messageData?.notifyName ||
      `Contato ${phone}`;

    // 💬 Texto
    const message = extractMessageText(msgContent);

    if (!message) {
      logger.warn('[Normalizer] Mensagem sem conteúdo útil');
      return null;
    }

    // 🆔 ID único
    const messageId = key?.id || `${phone}-${Date.now()}`;

    return {
      phone,
      name,
      message,
      instanceId,
      messageId,
      remoteJid,
    };

  } catch (error) {
    logger.error('[Normalizer] Erro:', error.message);
    return null;
  }
}

// 📞 Extrair telefone
function extractPhone(remoteJid) {
  if (!remoteJid) return null;

  const raw = remoteJid.split('@')[0];
  const digits = raw.replace(/\D/g, '');

  if (!digits || digits.length < 8) return null;

  if (digits.startsWith('55')) {
    return `+${digits}`;
  }

  return `+55${digits}`;
}

// 💬 Extrair texto
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