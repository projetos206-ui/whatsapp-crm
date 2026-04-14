const evolutionService = require('../services/evolutionService');
const bitrixService = require('../services/bitrixService');
const { normalizePayload } = require('../utils/payloadNormalizer');
const { isDuplicate, markProcessed } = require('../utils/deduplicator');
const logger = require('../utils/logger');

/**
 * POST /webhook/evolution
 * Ponto de entrada para todos os webhooks da Evolution API
 */
async function handleEvolution(req, res) {
  try {
    const rawPayload = req.body;

    // ── 1. Log do payload recebido ────────────────────────────────────────────
    logger.info('[Webhook] Payload recebido', {
      event: rawPayload?.event,
      instance: rawPayload?.instance,
    });

    // ── 2. Filtrar apenas eventos de mensagem ─────────────────────────────────
    if (!evolutionService.isMessageEvent(rawPayload)) {
      logger.info('[Webhook] Evento ignorado (não é mensagem):', rawPayload?.event);
      return res.status(200).json({ status: 'ignored', reason: 'not_a_message_event' });
    }

    // ── 3. Normalizar dados ───────────────────────────────────────────────────
    const normalized = normalizePayload(rawPayload);

    if (!normalized) {
      logger.warn('[Webhook] Payload inválido ou sem dados suficientes');
      return res.status(400).json({ status: 'error', reason: 'invalid_payload' });
    }

    const { phone, name, message, instanceId, messageId } = normalized;

    logger.info(`[Webhook] Mensagem de ${name} (${phone}) via instância ${instanceId}`);

    // ── 4. Verificar duplicata ────────────────────────────────────────────────
    if (isDuplicate(messageId)) {
      logger.info(`[Webhook] Mensagem duplicada ignorada: ${messageId}`);
      return res.status(200).json({ status: 'ignored', reason: 'duplicate_message' });
    }

    markProcessed(messageId);

    // ── 5. Criar lead no Bitrix24 ─────────────────────────────────────────────
    // TODO: Aqui pode ser substituído por fila (RabbitMQ/Redis/BullMQ)
    const leadResult = await bitrixService.createLead({ phone, name, message, instanceId });

    logger.info(`[Bitrix] Lead criado com sucesso. ID: ${leadResult.leadId}`);

    return res.status(200).json({
      status: 'success',
      leadId: leadResult.leadId,
      contact: { name, phone },
    });

  } catch (error) {
    logger.error('[Webhook] Erro ao processar mensagem:', error.message);
    return res.status(200).json({ status: 'ignored', reason: 'invalid_payload' });
  }
}

module.exports = { handleEvolution };