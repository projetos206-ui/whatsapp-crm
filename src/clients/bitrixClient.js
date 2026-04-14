const axios = require('axios');
const logger = require('../utils/logger');

const BITRIX_URL = process.env.BITRIX_WEBHOOK_URL;

if (!BITRIX_URL) {
  logger.error('[BitrixClient] BITRIX_WEBHOOK_URL não configurada no .env');
}

const http = axios.create({
  baseURL: BITRIX_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Faz uma chamada REST ao Bitrix24
 * @param {string} method - ex: 'im.chat.add', 'im.message.add'
 * @param {object} params - parâmetros da chamada
 * @returns {any} result
 */
async function call(method, params = {}) {
  try {
    const res = await http.post(`${method}.json`, params);
    const data = res.data;

    if (data?.error) {
      throw new Error(`Bitrix error [${data.error}]: ${data.error_description}`);
    }

    return data?.result;
  } catch (err) {
    if (err.response) {
      const bitrixErr = err.response.data?.error_description || err.response.data?.error || err.message;
      throw new Error(`Bitrix24 API error: ${bitrixErr}`);
    }
    throw err;
  }
}

module.exports = { call };