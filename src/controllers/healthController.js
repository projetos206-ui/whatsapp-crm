const os = require('os');
const engine = require('../sync/engine');
const { getStats: getDedupStats } = require('../utils/deduplicator');
const { getQueueStats } = require('../queue/messageQueue');

function getHealth(req, res) {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    memory: {
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      systemTotal: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    },
    config: {
      bitrixConfigured: !!process.env.BITRIX_WEBHOOK_URL,
      evolutionConfigured: !!(process.env.EVOLUTION_BASE_URL && process.env.EVOLUTION_API_KEY),
      secretConfigured: !!process.env.EVOLUTION_WEBHOOK_SECRET,
    },
    deduplicator: getDedupStats(),
    queues: getQueueStats(),
    engine: engine.getStatus(),
  });
}

module.exports = { getHealth };