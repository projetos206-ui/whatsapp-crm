const bitrix = require('../clients/bitrixClient');
const stateManager = require('../state/stateManager');
const logger = require('../utils/logger');
const { getLabelForInstance } = require('../config/instances');

// ─── im.chat.add ──────────────────────────────────────────────────────────────

/**
 * Cria um chat no Bitrix24 IM (Open Channel ou chat simples)
 * 1 chat por número de telefone — nunca duplicar
 *
 * @param {{ phone, name, instanceId }} params
 * @returns {string} chatId
 */
async function getOrCreateChat({ phone, name, instanceId }) {
  // Verificar se já existe no state
  const cached = stateManager.getChatId(phone);
  if (cached) {
    logger.debug(`[BitrixIM] Chat existente para ${phone}: #${cached}`);
    return cached;
  }

  const instanceLabel = getLabelForInstance(instanceId);
  const title = `WhatsApp | ${name} | ${phone} [${instanceLabel}]`;

  logger.info(`[BitrixIM] Criando chat: "${title}"`);

  try {
    // im.chat.add cria um chat de grupo no IM do Bitrix24
    const result = await bitrix.call('im.chat.add', {
      TYPE: 'OPEN',           // OPEN = canal aberto (visível a todos com acesso)
      TITLE: title,
      MESSAGE: `🔌 Chat WhatsApp criado automaticamente\n📞 ${phone}\n👤 ${name}\n🏷️ Instância: ${instanceLabel}`,
      USERS: [],              // Deixar vazio ou adicionar IDs de usuários Bitrix
    });

    const chatId = String(result);
    stateManager.setChatId(phone, chatId);
    logger.info(`[BitrixIM] Chat criado: #${chatId} para ${phone}`);
    return chatId;

  } catch (err) {
    logger.error(`[BitrixIM] Falha ao criar chat para ${phone}: ${err.message}`);
    throw err;
  }
}

// ─── im.message.add ───────────────────────────────────────────────────────────

/**
 * Envia uma mensagem para o chat Bitrix24 IM
 *
 * Formato visual WhatCRM:
 * ┌─────────────────────────────────────┐
 * │ 📱 WhatsApp                         │
 * │ 👤 João Silva                       │
 * │ 📞 +5511999887766                  │
 * │ 🔌 Vendas (instancia-1)            │
 * │ 🕒 01/01/2025 14:30               │
 * │                                     │
 * │ 💬 Olá! Gostaria de saber mais...  │
 * └─────────────────────────────────────┘
 *
 * @param {{ chatId, name, phone, instanceId, message, timestamp }} params
 * @returns {string} messageId
 */
async function sendMessage({ chatId, name, phone, instanceId, message, timestamp }) {
  const instanceLabel = getLabelForInstance(instanceId);
  const dateStr = formatTimestamp(timestamp);

  const text = [
    `📱 *WhatsApp*`,
    `👤 ${name}`,
    `📞 ${phone}`,
    `🔌 ${instanceLabel} (${instanceId})`,
    `🕒 ${dateStr}`,
    ``,
    `💬 ${message}`,
  ].join('\n');

  try {
    const result = await bitrix.call('im.message.add', {
      CHAT_ID: chatId,
      MESSAGE: text,
      // SYSTEM: 'N',    // N = mensagem de usuário, Y = mensagem do sistema
    });

    return String(result);
  } catch (err) {
    logger.error(`[BitrixIM] Falha ao enviar mensagem no chat #${chatId}: ${err.message}`);
    throw err;
  }
}

/**
 * Envia uma mensagem simples de sistema (notificação interna)
 */
async function sendSystemMessage(chatId, text) {
  try {
    return await bitrix.call('im.message.add', {
      CHAT_ID: chatId,
      MESSAGE: text,
      SYSTEM: 'Y',
    });
  } catch (err) {
    logger.warn(`[BitrixIM] Falha ao enviar msg sistema no chat #${chatId}: ${err.message}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(timestamp) {
  if (!timestamp) return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

module.exports = { getOrCreateChat, sendMessage, sendSystemMessage };