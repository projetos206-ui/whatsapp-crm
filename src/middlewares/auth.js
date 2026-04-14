const logger = require('../utils/logger');

/**
 * Middleware de autenticação opcional via EVOLUTION_SECRET
 *
 * Configure na Evolution API:
 *   Webhook → Global Webhook → Authorization Header → Bearer SEU_SECRET
 *
 * Se EVOLUTION_SECRET não estiver no .env, a validação é desativada.
 */
function validateEvolutionSecret(req, res, next) {
  const secret = process.env.EVOLUTION_SECRET;

  // Se não configurado, pular validação
  if (!secret) {
    return next();
  }

  const authHeader = req.headers['authorization'] || req.headers['apikey'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (token !== secret) {
    logger.warn('[Auth] Requisição rejeitada - secret inválido', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(401).json({ status: 'error', message: 'Não autorizado' });
  }

  next();
}

module.exports = { validateEvolutionSecret };