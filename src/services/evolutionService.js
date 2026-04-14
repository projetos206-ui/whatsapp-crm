const MESSAGE_EVENTS = ['messages.upsert', 'MESSAGES_UPSERT'];

function isMessageEvent(payload) {
  if (!payload || !payload.event) return false;

  if (!MESSAGE_EVENTS.includes(payload.event)) return false;

  let msg;

  if (payload?.data?.messages?.length) {
    msg = payload.data.messages[0];
  } else if (payload?.data?.key) {
    msg = payload.data;
  }

  if (!msg) return false;

  // 🚫 Ignorar mensagens enviadas por você mesmo
  if (msg?.key?.fromMe === true) return false;

  return true;
}

function extractInstanceId(payload) {
  return payload?.instance || payload?.instanceName || 'default';
}

const INSTANCE_MAP = {
  'instancia-1': 'Vendas',
  'instancia-2': 'Suporte',
  'instancia-3': 'Financeiro',
  'instancia-4': 'RH',
  'instancia-5': 'Marketing',
  'instancia-6': 'Logística',
  'instancia-7': 'Diretoria',
};

function getInstanceLabel(instanceId) {
  return INSTANCE_MAP[instanceId] || instanceId;
}

module.exports = { isMessageEvent, extractInstanceId, getInstanceLabel };