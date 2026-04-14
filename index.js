require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor Evolution-Bitrix rodando na porta ${PORT}`);
  console.log(`📡 Webhook endpoint: POST http://localhost:${PORT}/webhook/evolution`);
  console.log(`❤️  Health check:     GET  http://localhost:${PORT}/health`);
  console.log(`\n⏳ Aguardando mensagens do WhatsApp...\n`);
});