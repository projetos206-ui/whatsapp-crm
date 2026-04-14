/**
 * State Manager — telefone → chatId do Bitrix24
 *
 * Garante que cada número WhatsApp tenha exatamente 1 chat no Bitrix24.
 * Armazena o mapeamento em memória (Map) com interface preparada para Redis.
 *
 * ──────────────────────────────────────────────────────────────
 * TODO: Substituir Map por Redis para escala multi-servidor:
 *
 *   const redis = require('ioredis');
 *   const client = new redis(process.env.REDIS_URL);
 *
 *   async function getChatId(phone) {
 *     return await client.get(`chat:${phone}`);
 *   }
 *   async function setChatId(phone, chatId) {
 *     await client.set(`chat:${phone}`, chatId);
 *   }
 * ──────────────────────────────────────────────────────────────
 */

const logger = require('../utils/logger');

// Map: phone → bitrix chatId
const chatMap = new Map();

// Map: instanceId → metadata
const instanceMap = new Map();

// ─── Chat State ───────────────────────────────────────────────────────────────

function getChatId(phone) {
  return chatMap.get(normalizePhone(phone)) || null;
}

function setChatId(phone, chatId) {
  chatMap.set(normalizePhone(phone), chatId);
  logger.debug(`[State] Mapeado ${phone} → chatId #${chatId}`);
}

function hasChatId(phone) {
  return chatMap.has(normalizePhone(phone));
}

function getAllChats() {
  return Object.fromEntries(chatMap);
}

// ─── Instance State ───────────────────────────────────────────────────────────

function setInstanceStatus(instanceId, status) {
  instanceMap.set(instanceId, { status, updatedAt: new Date().toISOString() });
}

function getInstanceStatus(instanceId) {
  return instanceMap.get(instanceId) || { status: 'unknown' };
}

function getAllInstanceStatuses() {
  return Object.fromEntries(instanceMap);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
  return {
    totalChats: chatMap.size,
    totalInstances: instanceMap.size,
    chats: getAllChats(),
    instances: getAllInstanceStatuses(),
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
}

module.exports = {
  getChatId,
  setChatId,
  hasChatId,
  getAllChats,
  setInstanceStatus,
  getInstanceStatus,
  getAllInstanceStatuses,
  getStats,
};