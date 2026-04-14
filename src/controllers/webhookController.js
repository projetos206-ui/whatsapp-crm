const evolutionService = require('../services/evolutionService');
const bitrixService = require('../services/bitrixService');
const { normalizePayload } = require('../utils/payloadNormalizer');
const { isDuplicate, markProcessed } = require('../utils/deduplicator');
const logger = require('../utils/logger');

async function handleEvolution(req, res) {
  try {
    const rawPayload = req.body;

    logger.info('[Webhook] Payload recebido', {
      event: rawPayload?.event,
      instance: rawPayload?.instance,
    });

    if (!evolutionService.isMessageEvent(rawPayload)) {
      return res.status(200).json({ status: 'ignored' });
    }

    const normalized = normalizePayload(rawPayload);

    if (!normalized) {
      return res.status(200).json({ status: 'ignored' });
    }

    const { phone, name, message, instanceId, messageId } = normalized;

    logger.info(`[Webhook] ${name} (${phone}) → ${message}`);

    if (isDuplicate(messageId)) {
      return res.status(200).json({ status: 'duplicate' });
    }

    markProcessed(messageId);

    const result = await bitrixService.createOrUpdateLead({
      phone,
      name,
      message,
      instanceId,
    });

    return res.status(200).json({
      status: 'success',
      ...result,
    });

  } catch (error) {
    logger.error('[Webhook] Erro:', error.message);
    return res.status(200).json({ status: 'error' });
  }
}

module.exports = { handleEvolution };