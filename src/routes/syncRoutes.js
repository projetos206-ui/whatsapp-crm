const express = require('express');
const router = express.Router();

// Status da sincronização
router.get('/status', (req, res) => {
  res.status(200).json({
    sync: 'running',
    queues: {
      pending: 0,
      processed: 0,
    },
  });
});

module.exports = router;