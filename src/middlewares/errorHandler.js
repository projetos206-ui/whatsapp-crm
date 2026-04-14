const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('[Express] Erro não tratado:', err.message);

  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
}

module.exports = { errorHandler };