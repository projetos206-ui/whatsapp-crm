const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');
const healthRoutes = require('./routes/healthRoutes.js');
const syncRoutes = require('./routes/syncRoutes.js');
const { requestLogger } = require('./middlewares/requestLogger');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);
app.use('/sync', syncRoutes);

app.get('/', (req, res) => res.json({
  service: 'Evolution → Bitrix24 Sync Engine (WhatCRM Level)',
  version: '2.0.0',
  status: 'online',
}));

app.use(errorHandler);

module.exports = app;