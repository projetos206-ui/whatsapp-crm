const axios = require('axios');
const logger = console;

const BITRIX_URL = process.env.BITRIX_WEBHOOK_URL;

async function findLeadByPhone(phone) {
  const response = await axios.post(`${BITRIX_URL}crm.duplicate.findbycomm.json`, {
    type: 'PHONE',
    values: [phone],
  });

  return response.data?.result?.LEAD || [];
}

async function addCommentToLead(leadId, comment) {
  await axios.post(`${BITRIX_URL}crm.timeline.comment.add.json`, {
    fields: {
      ENTITY_ID: leadId,
      ENTITY_TYPE: 'lead',
      COMMENT: comment,
    },
  });
}

function buildComment({ message, phone, instanceId }) {
  const now = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

  return [
    `📱 WhatsApp`,
    `📅 ${now}`,
    `📞 ${phone}`,
    `🔌 Instância: ${instanceId}`,
    ``,
    `💬 ${message}`,
  ].join('\n');
}

async function createOrUpdateLead({ phone, name, message, instanceId }) {
  if (!BITRIX_URL) throw new Error('BITRIX_WEBHOOK_URL não configurada');

  const existing = await findLeadByPhone(phone);
  const comment = buildComment({ message, phone, instanceId });

  if (existing.length > 0) {
    const leadId = existing[0];

    logger.log('🔁 Lead existente → adicionando comentário:', leadId);

    await addCommentToLead(leadId, comment);

    return { leadId, updated: true };
  }

  logger.log('🆕 Criando novo lead');

  const response = await axios.post(`${BITRIX_URL}crm.lead.add.json`, {
    fields: {
      TITLE: `Lead WhatsApp - ${name}`,
      NAME: name.split(' ')[0],
      LAST_NAME: name.split(' ').slice(1).join(' ') || 'WhatsApp',
      PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }],
      COMMENTS: comment,
      SOURCE_ID: 'WEB',
      STATUS_ID: 'NEW',
    },
  });

  const leadId = response.data?.result;

  return { leadId, created: true };
}

module.exports = { createOrUpdateLead };