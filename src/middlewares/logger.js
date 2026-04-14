const { logger } = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    if (typeof logger[level] === 'function') {
      logger[level](`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        ip: req.ip,
      });
    } else {
      // fallback seguro
      logger.info(`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
        ip: req.ip,
      });
    }
  });

  next();
}

module.exports = { requestLogger };