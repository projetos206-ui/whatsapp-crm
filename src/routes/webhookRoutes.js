const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { validateEvolutionSecret } = require('../middlewares/auth');

// POST /webhook/evolution
// Recebe eventos da Evolution API (mensagens WhatsApp)
router.post('/evolution', validateEvolutionSecret, webhookController.handleEvolution);

module.exports = router;