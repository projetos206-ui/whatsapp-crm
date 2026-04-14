/**
 * Initial Sync — Importação de histórico completo
 *
 * Fluxo por instância:
 *  1. Buscar todos os chats da Evolution API
 *  2. Para cada chat individual (não-grupo):
 *     a. Criar/recuperar chat no Bitrix24 IM
 *     b. Buscar histórico de mensagens
 *     c. Enfileirar mensagens em ordem cronológica
 *     d. Enviar cada mensagem ao Bitrix com rate limiting
 */

const evolutionClient = require('../clients/evolutionClient');
const bitrixImService = require('../services/bitrixImService');
const stateManager    = require('../state/stateManager');
const queue           = require('../queue/messageQueue');
const { normalizePayload, extractPhone } = require('../utils/payloadNormalizer');
const logger          = require('../utils/logger');

// Track de chats já sincronizados (evitar re-sync em reinicializações)
const syncedChats = new Set();

/**
 * Executa o sync inicial para uma instância WhatsApp
 * @param {string} instanceId
 */
async function runInitialSync(instanceId) {
  logger.info(`\n${'─'.repeat(60)}`);
  logger.info(`[InitialSync] ▶ Iniciando sync da instância: ${instanceId}`);
  logger.info(`${'─'.repeat(60)}`);

  stateManager.setInstanceStatus(instanceId, 'syncing');

  // 1. Verificar conexão
  const state = await evolutionClient.getConnectionState(instanceId);
  if (state !== 'open') {
    logger.warn(`[InitialSync] Instância ${instanceId} não está conectada (estado: ${state}). Pulando.`);
    stateManager.setInstanceStatus(instanceId, `disconnected:${state}`);
    return;
  }

  // 2. Buscar chats
  const chats = await evolutionClient.getChats(instanceId);
  const individualChats = chats.filter(chat => {
    const jid = chat.id || chat.remoteJid || '';
    return jid.includes('@s.whatsapp.net') || jid.includes('@c.us');
  });

  logger.info(`[InitialSync] ${instanceId}: ${individualChats.length} chats individuais para sincronizar`);

  let synced = 0;
  let errors = 0;

  for (const chat of individualChats) {
    const remoteJid = chat.id || chat.remoteJid || '';
    const cacheKey  = `${instanceId}:${remoteJid}`;

    if (syncedChats.has(cacheKey)) {
      logger.debug(`[InitialSync] Já sincronizado: ${remoteJid}`);
      continue;
    }

    try {
      await syncChat({ instanceId, chat, remoteJid });
      syncedChats.add(cacheKey);
      synced++;
    } catch (err) {
      logger.error(`[InitialSync] Erro ao sincronizar ${remoteJid}: ${err.message}`);
      errors++;
    }
  }

  stateManager.setInstanceStatus(instanceId, 'synced');
  logger.info(`[InitialSync] ✅ Instância ${instanceId} concluída — ${synced} chats sincronizados, ${errors} erros`);
}

/**
 * Sincroniza um chat individual:
 *  - Cria/recupera chat Bitrix
 *  - Busca e envia histórico de mensagens
 */
async function syncChat({ instanceId, chat, remoteJid }) {
  const phone = extractPhone(remoteJid);
  if (!phone) return;

  const name = chat.name || chat.pushName || `Contato ${phone}`;

  logger.info(`[InitialSync] Sincronizando: ${name} (${phone})`);

  // Criar/recuperar chat no Bitrix
  const chatId = await bitrixImService.getOrCreateChat({ phone, name, instanceId });

  // Buscar histórico
  const messages = await evolutionClient.getMessages(instanceId, remoteJid);

  if (!messages || messages.length === 0) {
    logger.debug(`[InitialSync] Sem mensagens históricas para ${phone}`);
    return;
  }

  // Ordenar cronologicamente (mais antigas primeiro)
  const sorted = [...messages].sort((a, b) => {
    const tsA = a.messageTimestamp || a.timestamp || 0;
    const tsB = b.messageTimestamp || b.timestamp || 0;
    return tsA - tsB;
  });

  logger.info(`[InitialSync] Enfileirando ${sorted.length} mensagens de ${phone}`);

  // Enviar marcador de início do histórico
  await queue.enqueue(instanceId, () =>
    bitrixImService.sendSystemMessage(chatId, `📜 *Histórico importado — ${sorted.length} mensagens*`),
    `historico_header:${phone}`
  );

  // Enfileirar cada mensagem
  for (const msg of sorted) {
    const normalized = normalizeEvolutionMessage(msg, instanceId, phone, name);
    if (!normalized) continue;

    await queue.enqueue(
      instanceId,
      () => bitrixImService.sendMessage({ chatId, ...normalized }),
      `history:${phone}:${msg.key?.id || Math.random()}`
    );
  }
}

/**
 * Normaliza uma mensagem do histórico Evolution para o formato de envio Bitrix
 */
function normalizeEvolutionMessage(msg, instanceId, phone, name) {
  try {
    const content = msg?.message || {};
    const text =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      content?.audioMessage ? '🎤 Áudio' :
      content?.stickerMessage ? '🎭 Sticker' :
      content?.locationMessage ? '📍 Localização' :
      '(sem texto)';

    const fromMe  = msg?.key?.fromMe || false;
    const ts      = msg?.messageTimestamp || msg?.timestamp;
    const nameStr = fromMe ? `🏢 Empresa (saída)` : name;

    return { name: nameStr, phone, instanceId, message: text, timestamp: ts };
  } catch {
    return null;
  }
}

module.exports = { runInitialSync };