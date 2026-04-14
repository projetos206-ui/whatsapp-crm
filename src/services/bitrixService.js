const axios = require('axios');
const logger = require('../utils/logger');
const { getInstanceLabel } = require('./evolutionService');

const BITRIX_URL = process.env.BITRIX_WEBHOOK_URL;

/**
 * Cria um lead no Bitrix24 via Webhook REST
 *
 * Documentação: https://apidocs.bitrix24.com/api-reference/crm/leads/crm-lead-add.html
 */
async function createLead({ phone, name, message, instanceId }) {
  if (!BITRIX_URL) {
    throw new Error('BITRIX_WEBHOOK_URL não configurada no .env');
  }

  const instanceLabel = getInstanceLabel(instanceId);

  // ── Monta campos do lead ───────────────────────────────────────────────────
  const leadFields = {
    TITLE: `Lead WhatsApp - ${name}`,
    NAME: extractFirstName(name),
    LAST_NAME: extractLastName(name),
    PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }],
    COMMENTS: buildComment({ message, instanceId, instanceLabel, phone }),
    SOURCE_ID: 'WEB',                    // Fonte: Web (pode customizar)
    STATUS_ID: 'NEW',                    // Status inicial: Novo
    // Campos extras úteis:
    // ASSIGNED_BY_ID: '1',             // ID do responsável no Bitrix
    // UF_CRM_WHATSAPP_INSTANCE: instanceId, // Campo personalizado (criar no Bitrix)
  };

  logger.info('[Bitrix] Criando lead:', { title: leadFields.TITLE, phone });

  try {
    const response = await axios.post(
      `${BITRIX_URL}crm.lead.add.json`,
      { fields: leadFields },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const leadId = response.data?.result;

    if (!leadId) {
      logger.warn('[Bitrix] Resposta inesperada:', response.data);
      throw new Error('Bitrix24 não retornou ID do lead');
    }

    return { leadId, success: true };

  } catch (error) {
    // Erro HTTP do Bitrix
    if (error.response) {
      const bitrixError = error.response.data?.error_description || error.response.data?.error;
      logger.error('[Bitrix] Erro da API:', bitrixError);
      throw new Error(`Bitrix24 retornou erro: ${bitrixError}`);
    }

    // Timeout ou erro de rede
    if (error.code === 'ECONNABORTED') {
      logger.error('[Bitrix] Timeout ao conectar');
      throw new Error('Timeout ao conectar com Bitrix24');
    }

    throw error;
  }
}

/**
 * Monta o comentário do lead com contexto completo
 */
function buildComment({ message, instanceId, instanceLabel, phone }) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return [
    `📱 Mensagem recebida via WhatsApp`,
    ``,
    `📅 Data/Hora: ${now}`,
    `📞 Número: ${phone}`,
    `🔌 Instância: ${instanceLabel} (${instanceId})`,
    ``,
    `💬 Mensagem:`,
    message || '(sem texto)',
  ].join('\n');
}

function extractFirstName(fullName) {
  if (!fullName) return 'Contato';
  return fullName.split(' ')[0];
}

function extractLastName(fullName) {
  if (!fullName) return 'WhatsApp';
  const parts = fullName.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}

module.exports = { createLead };