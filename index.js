require('dotenv').config();
const app = require('./src/app');
const engine = require('./src/sync/engine');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  // 1. Start HTTP server (webhook receiver)
  app.listen(PORT, () => {
    logger.info(`🚀 Sync Engine online — porta ${PORT}`);
    logger.info(`📡 Webhook:     POST http://localhost:${PORT}/webhook/evolution`);
    logger.info(`❤️  Health:      GET  http://localhost:${PORT}/health`);
    logger.info(`🔄 Sync status: GET  http://localhost:${PORT}/sync/status`);
  });

  // 2. Start the sync engine (initialSync + realtimeSync ready)
  await engine.start();
}

bootstrap().catch((err) => {
  logger.error('Fatal error on bootstrap:', err.message);
  process.exit(1);
});