const { extractInstanceId } = require('../services/evolutionService');
const logger = require('./logger');

/**
 * Normaliza o payload da Evolution API para um formato consistente.
 *
 * A Evolution API pode enviar dados em estruturas ligeiramente diferentes
 * dependendo da versão e tipo de mensagem. Esta função abstrai essas variações.
 *
 * Exemplo de payload Evolution v2:
 * {
 *   event: "messages.upsert",
 *   instance: "instancia-1",
 *   data: {
 *     key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "MSG123" },
 *     pushName: "João Silva",
 *     message: { conversation: "Olá, quero informações" }
 *   }
 * }
 */
function normalizePayload(rawPayload) {
  try {
    const data = rawPayload?.data || rawPayload;
    const key = data?.key || {};
    const msgContent = data?.message || {};

    // ── Extrair remoteJid (número do WhatsApp) ─────────────────────────────
    const remoteJid = key?.remoteJid || data?.remoteJid || '';

    // Ignorar grupos (@g.us) — processar apenas chats individuais
    if (remoteJid.includes('@g.us')) {
      logger.info('[Normalizer] Mensagem de grupo ignorada:', remoteJid);
      return null;
    }

    // ── Extrair telefone ───────────────────────────────────────────────────
    const phone = extractPhone(remoteJid);
    if (!phone) {
      logger.warn('[Normalizer] Não foi possível extrair telefone de:', remoteJid);
      return null;
    }

    // ── Extrair nome ───────────────────────────────────────────────────────
    const name = data?.pushName || data?.name || `Contato ${phone}`;

    // ── Extrair texto da mensagem ──────────────────────────────────────────
    const message = extractMessageText(msgContent, data);

    // ── ID único da mensagem (para deduplicação) ───────────────────────────
    const messageId = key?.id || `${phone}-${Date.now()}`;

    // ── ID da instância WhatsApp ───────────────────────────────────────────
    const instanceId = extractInstanceId(rawPayload);

    return { phone, name, message, instanceId, messageId, remoteJid };

  } catch (error) {
    logger.error('[Normalizer] Erro ao normalizar payload:', error.message);
    return null;
  }
}

/**
 * Extrai e formata o número de telefone
 * Entrada:  "5511999999999@s.whatsapp.net"
 * Saída:    "+5511999999999"
 */
function extractPhone(remoteJid) {
  if (!remoteJid) return null;

  // Remove sufixo @s.whatsapp.net ou @c.us
  const raw = remoteJid.split('@')[0];

  // Remove qualquer coisa que não seja número
  const digits = raw.replace(/\D/g, '');

  if (!digits || digits.length < 8) return null;

  // Adiciona + se não tiver código de país (assume Brasil +55)
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }

  if (digits.length >= 10) {
    return `+55${digits}`;
  }

  return `+${digits}`;
}

/**
 * Extrai o texto da mensagem de diferentes formatos possíveis
 */
function extractMessageText(msgContent, data) {
  return (
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    msgContent?.imageMessage?.caption ||
    msgContent?.videoMessage?.caption ||
    msgContent?.documentMessage?.caption ||
    msgContent?.buttonsResponseMessage?.selectedDisplayText ||
    msgContent?.listResponseMessage?.title ||
    data?.body ||
    data?.text ||
    '(mensagem sem texto — áudio, imagem ou outro tipo)'
  );
}

module.exports = { normalizePayload, extractPhone };