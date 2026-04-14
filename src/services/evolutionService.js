/**
 * Serviço para interpretar payloads da Evolution API
 *
 * Eventos suportados:
 *  - messages.upsert   → nova mensagem recebida
 *  - messages.update   → status de mensagem atualizado (ignorar)
 *  - connection.update → status de conexão (ignorar)
 *  - qrcode.updated    → QR Code gerado (ignorar)
 */

const MESSAGE_EVENTS = ['messages.upsert', 'MESSAGES_UPSERT'];

/**
 * Verifica se o payload é um evento de mensagem nova
 */
function isMessageEvent(payload) {
  if (!payload || !payload.event) return false;

  // Ignorar mensagens enviadas pelo próprio número (fromMe)
  const data = payload.data || payload;
  const key = data?.key || data?.message?.key;
  if (key?.fromMe === true) return false;

  return MESSAGE_EVENTS.includes(payload.event);
}

/**
 * Extrai o identificador único da instância WhatsApp
 * Permite mapear qual dos 7 números recebeu a mensagem
 */
function extractInstanceId(payload) {
  return payload?.instance || payload?.instanceName || 'default';
}

/**
 * Mapeia instâncias para nomes amigáveis (configurar conforme seu setup)
 */
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