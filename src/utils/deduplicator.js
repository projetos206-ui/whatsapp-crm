/**
 * Deduplicador com TTL — evita processar a mesma mensagem duas vezes
 *
 * A Evolution API pode reenviar webhooks em caso de falha de rede.
 * Este módulo rastreia IDs de mensagens já processadas com expiração automática.
 */

const logger = require('./logger');

const TTL_MS = (parseInt(process.env.DEDUP_TTL_MINUTES || '5', 10)) * 60 * 1000;
const MAX_SIZE = 50_000;

// Map: messageId → timestamp
const seen = new Map();

/**
 * Gera um ID único de mensagem a partir do payload Evolution
 */
function buildMessageId(payload) {
  const data = payload?.data || payload;
  const key = data?.key || {};
  // Usar o ID nativo da mensagem do Baileys
  if (key?.id) return `${key.remoteJid || ''}_${key.id}`;
  // Fallback: remoteJid + timestamp
  const jid = key?.remoteJid || data?.remoteJid || '';
  const ts  = data?.messageTimestamp || Date.now();
  return `${jid}_${ts}`;
}

function isDuplicate(messageId) {
  if (!messageId) return false;
  const ts = seen.get(messageId);
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) {
    seen.delete(messageId);
    return false;
  }
  return true;
}

function markSeen(messageId) {
  if (!messageId) return;
  if (seen.size >= MAX_SIZE) pruneExpired();
  seen.set(messageId, Date.now());
}

function pruneExpired() {
  const now = Date.now();
  let pruned = 0;
  for (const [id, ts] of seen.entries()) {
    if (now - ts > TTL_MS) { seen.delete(id); pruned++; }
  }
  if (pruned > 0) logger.debug(`[Dedup] Removidas ${pruned} entradas expiradas`);
}

function getStats() {
  return { size: seen.size, maxSize: MAX_SIZE, ttlMinutes: TTL_MS / 60000 };
}

// Limpeza periódica a cada 10min
setInterval(pruneExpired, 10 * 60 * 1000);

module.exports = { buildMessageId, isDuplicate, markSeen, getStats };