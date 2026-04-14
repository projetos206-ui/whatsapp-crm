const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_CACHE_SIZE = 10_000;

const processedMessages = new Map();

/**
 * Verifica duplicidade
 */
function isDuplicate(messageId) {
  if (!messageId) return false;

  const now = Date.now();
  const processedAt = processedMessages.get(messageId);

  if (!processedAt) return false;

  // expirou
  if (now - processedAt > CACHE_TTL_MS) {
    processedMessages.delete(messageId);
    return false;
  }

  return true;
}

/**
 * Marca como processado
 */
function markProcessed(messageId) {
  if (!messageId) return;

  const now = Date.now();

  // limpa sempre que crescer um pouco
  if (processedMessages.size > MAX_CACHE_SIZE) {
    pruneExpired(now);
  }

  processedMessages.set(messageId, now);
}

/**
 * Limpeza eficiente
 */
function pruneExpired(now = Date.now()) {
  for (const [id, timestamp] of processedMessages) {
    if (now - timestamp > CACHE_TTL_MS) {
      processedMessages.delete(id);
    }
  }
}

/**
 * Health
 */
function getCacheStats() {
  return {
    size: processedMessages.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMinutes: CACHE_TTL_MS / 60000,
  };
}

// 🔥 limpeza inteligente (não mantém processo ativo)
function scheduleCleanup() {
  setTimeout(() => {
    pruneExpired();
    scheduleCleanup();
  }, 10 * 60 * 1000).unref(); // 👈 IMPORTANTE
}

scheduleCleanup();

module.exports = {
  isDuplicate,
  markProcessed,
  getCacheStats,
};