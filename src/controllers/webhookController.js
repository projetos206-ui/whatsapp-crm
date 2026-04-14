const { normalizePayload } = require('../utils/payloadNormalizer');
const { processRealtimeMessage } = require('../sync/realtimeSync');
const logger = require('../utils/logger');

const MESSAGE_EVENTS = new Set(['messages.upsert', 'MESSAGES_UPSERT', 'message']);

/**
 * POST /webhook/evolution
 *
 * Sempre responde 200 OK imediatamente (requisito crítico).
 * O processamento ocorre em background para não travar o webhook.
 */
async function handleEvolution(req, res) {
  // Responder 200 IMEDIATAMENTE — Evolution API não pode ficar aguardando
  res.status(200).json({ status: 'received' });

  const raw = req.body;

  // Processar em background (fire-and-forget)
  setImmediate(async () => {
    try {
      const event = raw?.event || raw?.type || '';

      if (!MESSAGE_EVENTS.has(event)) {
        logger.debug(`[Webhook] Evento ignorado: ${event}`);
        return;
      }

      const normalized = normalizePayload(raw);
      if (!normalized) {
        logger.debug('[Webhook] Payload inválido ou sem dados suficientes');
        return;
      }

      logger.info(`[Webhook] 📨 ${normalized.name} (${normalized.phone}) via ${normalized.instanceId}`);

      await processRealtimeMessage(normalized);

    } catch (err) {
      logger.error('[Webhook] Erro no processamento background:', err.message);
    }
  });
}

module.exports = { handleEvolution };