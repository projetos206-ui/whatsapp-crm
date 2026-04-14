/**
 * Configuração das instâncias WhatsApp
 * Cada instância representa um número conectado na Evolution API
 */

const RAW_INSTANCES = (process.env.EVOLUTION_INSTANCES || 'instancia-1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const INSTANCE_LABELS = {
  'instancia-1': 'Vendas',
  'instancia-2': 'Suporte',
  'instancia-3': 'Financeiro',
  'instancia-4': 'RH',
  'instancia-5': 'Marketing',
  'instancia-6': 'Logística',
  'instancia-7': 'Diretoria',
};

function getInstances() {
  return RAW_INSTANCES.map((id) => ({
    id,
    label: INSTANCE_LABELS[id] || id,
  }));
}

function getLabelForInstance(instanceId) {
  return INSTANCE_LABELS[instanceId] || instanceId;
}

module.exports = {
  getInstances,
  getLabelForInstance,
};