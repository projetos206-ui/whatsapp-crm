/**
 * Realtime Sync — Processa mensagens recebidas via webhook
 *
 * Fluxo:
 *  1. Receber payload normalizado do webhookController
 *  2. Deduplicar pelo messageId
 *  3. Recuperar/criar chat no Bitrix
 *  4. Enfileirar envio da mensagem
 */

const bitrixImService = require('../services/bitrixImService');
const { enqueue }     = require('../queue/messageQueue');
const { isDuplicate, markSeen } = require('../utils/deduplicator');
const logger          = require('../utils/logger');

/**
 * Processa uma mensagem em tempo real
 * @param {object} normalized - Saída de payloadNormalizer
 * @returns {{ status: string, chatId?: string }}
 */
async function processRealtimeMessage(normalized) {
  const { phone, name, message, instanceId, messageId, timestamp } = normalized;

  // ── 1. Deduplicação ────────────────────────────────────────────────────────
  if (isDuplicate(messageId)) {
    logger.info(`[Realtime] Duplicata ignorada: ${messageId}`);
    return { status: 'duplicate' };
  }
  markSeen(messageId);

  // ── 2. Criar/recuperar chat no Bitrix ──────────────────────────────────────
  let chatId;
  try {
    chatId = await bitrixImService.getOrCreateChat({ phone, name, instanceId });
  } catch (err) {
    logger.error(`[Realtime] Falha ao obter chat para ${phone}: ${err.message}`);
    return { status: 'error', error: err.message };
  }

  // ── 3. Enfileirar envio da mensagem ────────────────────────────────────────
  await enqueue(
    instanceId,
    () => bitrixImService.sendMessage({ chatId, name, phone, instanceId, message, timestamp }),
    `realtime:${phone}:${messageId}`
  );

  logger.info(`[Realtime] ✅ Mensagem de ${name} (${phone}) enfileirada → chat #${chatId}`);

  return { status: 'queued', chatId };
}

module.exports = { processRealtimeMessage };