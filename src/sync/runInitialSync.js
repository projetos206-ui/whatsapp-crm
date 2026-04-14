/**
 * Script CLI para executar o Initial Sync manualmente
 * Uso: node src/sync/runInitialSync.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { getInstances }  = require('../../config/instances');
const { runInitialSync } = require('./initialSync');
const logger             = require('../utils/logger');

async function main() {
  const instances = getInstances();
  logger.info(`[CLI] Executando Initial Sync para ${instances.length} instâncias...`);

  for (const { id } of instances) {
    await runInitialSync(id);
  }

  logger.info('[CLI] ✅ Sync concluído. Saindo.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('[CLI] Erro fatal:', err.message);
  process.exit(1);
});