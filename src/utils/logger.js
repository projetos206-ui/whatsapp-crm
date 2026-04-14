/**
 * Deduplicador em memória com TTL
 *
 * Evita processar a mesma mensagem duas vezes caso a Evolution API
 * envie o webhook mais de uma vez (retry em falhas, por exemplo).
 *
 * ⚠️  Este cache é em memória (não persiste entre reinicializações).
 * Para produção com múltiplos servidores, substituir por Redis.
 *
 * TODO: Substituir por Redis quando escalar horizontalmente:
 *   await redis.set(`msg:${id}`, '1', 'EX', TTL_SECONDS);
 *   const exists = await redis.exists(`msg:${id}`);
 */

const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutos
const MAX_CACHE_SIZE = 10_000;         // Limite de entradas em memória

// Map: messageId → timestamp de quando foi processado
const processedMessages = new Map();

/**
 * Verifica se a mensagem já foi processada
 */
function isDuplicate(messageId) {
  if (!messageId) return false;

  const processedAt = processedMessages.get(messageId);
  if (!processedAt) return false;

  // Expirou o TTL?
  if (Date.now() - processedAt > CACHE_TTL_MS) {
    processedMessages.delete(messageId);
    return false;
  }

  return true;
}

/**
 * Marca mensagem como processada
 */
function markProcessed(messageId) {
  if (!messageId) return;

  // Limpeza preventiva se cache muito grande
  if (processedMessages.size >= MAX_CACHE_SIZE) {
    pruneExpired();
  }

  processedMessages.set(messageId, Date.now());
}

/**
 * Remove entradas expiradas do cache
 */
function pruneExpired() {
  const now = Date.now();
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp > CACHE_TTL_MS) {
      processedMessages.delete(id);
    }
  }
}

/**
 * Retorna estatísticas do cache (usado no /health)
 */
function getCacheStats() {
  return {
    size: processedMessages.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMinutes: CACHE_TTL_MS / 60000,
  };
}

// Limpeza automática a cada 10 minutos
setInterval(pruneExpired, 10 * 60 * 1000);

module.exports = { isDuplicate, markProcessed, getCacheStats };