const os = require('os');
const { getCacheStats } = require('../utils/deduplicator');

function getHealth(req, res) {
  const stats = getCacheStats();

  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    memory: {
      used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
    },
    deduplicator: {
      cachedMessages: stats.size,
      maxSize: stats.maxSize,
    },
    environment: {
      nodeVersion: process.version,
      bitrixConfigured: !!process.env.BITRIX_WEBHOOK_URL,
      secretConfigured: !!process.env.EVOLUTION_SECRET,
    },
  });
}

module.exports = { getHealth };