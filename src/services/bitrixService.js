const axios = require('axios');
const logger = console;

const BITRIX_URL = process.env.BITRIX_WEBHOOK_URL;

// 🔎 Buscar lead por telefone
async function findLeadByPhone(phone) {
  const response = await axios.post(`${BITRIX_URL}crm.duplicate.findbycomm.json`, {
    type: 'PHONE',
    values: [phone],
  });

  return response.data?.result?.LEAD || [];
}

// ➕ Adicionar comentário no lead existente
async function addCommentToLead(leadId, comment) {
  await axios.post(`${BITRIX_URL}crm.timeline.comment.add.json`, {
    fields: {
      ENTITY_ID: leadId,
      ENTITY_TYPE: 'lead',
      COMMENT: comment,
    },
  });
}

// 🧱 Criar lead novo
async function createLead({ phone, name, message, instanceId }) {
  const leadFields = {
    TITLE: `Lead WhatsApp - ${name}`,
    NAME: extractFirstName(name),
    LAST_NAME: extractLastName(name),
    PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }],
    COMMENTS: buildComment({ message, phone, instanceId }),
    SOURCE_ID: 'WEB',
    STATUS_ID: 'NEW',
  };

  const response = await axios.post(`${BITRIX_URL}crm.lead.add.json`, {
    fields: leadFields,
  });

  const leadId = response.data?.result;

  if (!leadId) {
    throw new Error('Erro ao criar lead no Bitrix');
  }

  return { leadId, created: true };
}

// 🔄 Criar ou atualizar lead
async function createOrUpdateLead(data) {
  if (!BITRIX_URL) {
    throw new Error('BITRIX_WEBHOOK_URL não configurada');
  }

  const existingLeads = await findLeadByPhone(data.phone);

  const comment = buildComment({
    message: data.message,
    phone: data.phone,
    instanceId: data.instanceId,
  });

  if (existingLeads.length > 0) {
    const leadId = existingLeads[0];

    logger.log('🔁 Lead já existe, adicionando comentário:', leadId);

    await addCommentToLead(leadId, comment);

    return { leadId, updated: true };
  }

  logger.log('🆕 Criando novo lead');

  return await createLead(data);
}

// 🧾 Monta comentário
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
    `💬 ${message || '(sem texto)'}`,
  ].join('\n');
}

function extractFirstName(name) {
  return name?.split(' ')[0] || 'Contato';
}

function extractLastName(name) {
  const parts = name?.split(' ') || [];
  return parts.length > 1 ? parts.slice(1).join(' ') : 'WhatsApp';
}

module.exports = { createOrUpdateLead };