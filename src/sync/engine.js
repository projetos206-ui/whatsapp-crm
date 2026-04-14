/**
 * Sync Engine — Orquestrador principal
 *
 * Responsabilidades:
 *  - Iniciar o Initial Sync para todas as instâncias configuradas
 *  - Manter estado global do sistema
 *  - Expor interface para o restante da aplicação
 */

const { getInstances } = require('../config/instances');
const { runInitialSync } = require('./initialSync');
const stateManager       = require('../state/stateManager');
const logger             = require('../utils/logger');

let engineStarted = false;
let engineStartTime = null;

/**
 * Inicia o engine:
 *  1. Marca instâncias como pendentes
 *  2. Dispara Initial Sync para cada instância em paralelo
 *  3. Realtime Sync é ativado automaticamente via webhook (/webhook/evolution)
 */
async function start() {
  if (engineStarted) {
    logger.warn('[Engine] Já iniciado — ignorando chamada duplicada');
    return;
  }

  engineStarted  = true;
  engineStartTime = new Date().toISOString();

  const instances = getInstances();
  logger.info(`[Engine] 🔧 Iniciando com ${instances.length} instâncias: ${instances.map(i => i.id).join(', ')}`);

  // Marcar todas como pendentes
  instances.forEach(({ id }) => stateManager.setInstanceStatus(id, 'pending'));

  // Initial Sync em paralelo (mas cada fila é independente)
  const syncPromises = instances.map(({ id }) =>
    runInitialSync(id).catch((err) => {
      logger.error(`[Engine] Erro crítico no initialSync de ${id}: ${err.message}`);
      stateManager.setInstanceStatus(id, `error: ${err.message}`);
    })
  );

  // Não aguardar conclusão — sync roda em background
  Promise.all(syncPromises).then(() => {
    logger.info('[Engine] ✅ Initial Sync concluído para todas as instâncias');
  });

  logger.info('[Engine] ▶ Realtime Sync ativo — aguardando webhooks em POST /webhook/evolution');
}

function getStatus() {
  return {
    started: engineStarted,
    startedAt: engineStartTime,
    instances: stateManager.getAllInstanceStatuses(),
    state: stateManager.getStats(),
  };
}

module.exports = { start, getStatus };