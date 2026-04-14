const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');
const healthRoutes = require('./routes/healthRoutes');
const { requestLogger } = require('./middlewares/logger');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

// ─── Middlewares globais ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    service: 'Evolution API → Bitrix24 Integration',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      webhook: 'POST /webhook/evolution',
      health: 'GET /health',
    },
  });
});

// ─── Handler de erros ─────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;