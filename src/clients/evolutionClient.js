const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = process.env.EVOLUTION_BASE_URL;
const API_KEY  = process.env.EVOLUTION_API_KEY;
const MSG_LIMIT = parseInt(process.env.INITIAL_SYNC_MSG_LIMIT || '50', 10);

if (!BASE_URL || !API_KEY) {
  logger.error('[EvolutionClient] EVOLUTION_BASE_URL e EVOLUTION_API_KEY são obrigatórios no .env');
}

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'apikey': API_KEY,
    'Content-Type': 'application/json',
  },
});

// ─── Interceptor de erros ──────────────────────────────────────────────────────
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message;
    logger.error(`[EvolutionClient] HTTP Error: ${msg}`);
    return Promise.reject(err);
  }
);

// ─── API Methods ──────────────────────────────────────────────────────────────

/**
 * Lista todos os chats de uma instância
 * GET /chat/findChats/{instance}
 * @returns {Array<{ id: string, name: string, lastMessage?: object }>}
 */
async function getChats(instanceId) {
  try {
    const res = await http.get(`/chat/findChats/${instanceId}`);
    const chats = Array.isArray(res.data) ? res.data : res.data?.data || [];
    logger.info(`[Evolution] Instância ${instanceId}: ${chats.length} chats encontrados`);
    return chats;
  } catch (err) {
    logger.error(`[Evolution] Erro ao buscar chats da instância ${instanceId}: ${err.message}`);
    return [];
  }
}

/**
 * Busca mensagens de um chat específico
 * GET /chat/findMessages/{instance}?where[key][remoteJid]={chatId}&limit={n}
 * @returns {Array<MessageObject>}
 */
async function getMessages(instanceId, remoteJid, limit = MSG_LIMIT) {
  try {
    const res = await http.get(`/chat/findMessages/${instanceId}`, {
      params: {
        'where[key][remoteJid]': remoteJid,
        limit,
      },
    });
    const messages = res.data?.messages?.records || res.data?.records || res.data || [];
    logger.info(`[Evolution] ${remoteJid}: ${messages.length} mensagens buscadas`);
    return Array.isArray(messages) ? messages : [];
  } catch (err) {
    logger.error(`[Evolution] Erro ao buscar mensagens de ${remoteJid}: ${err.message}`);
    return [];
  }
}

/**
 * Verifica status de conexão de uma instância
 * GET /instance/connectionState/{instance}
 */
async function getConnectionState(instanceId) {
  try {
    const res = await http.get(`/instance/connectionState/${instanceId}`);
    return res.data?.instance?.state || res.data?.state || 'unknown';
  } catch (err) {
    return 'error';
  }
}

/**
 * Lista todas as instâncias criadas na Evolution API
 */
async function listInstances() {
  try {
    const res = await http.get('/instance/fetchInstances');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    logger.error('[Evolution] Erro ao listar instâncias:', err.message);
    return [];
  }
}

module.exports = { getChats, getMessages, getConnectionState, listInstances };