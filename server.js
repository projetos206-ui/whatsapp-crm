const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');
const winston = require('winston');

dotenv.config();

// ==================== Logger ====================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ==================== Cache ====================
class ChatSessionManager {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 86400 });
  }

  getKey(instance, phone) {
    return `${instance}:${phone}`;
  }

  set(instance, phone, chatId, contactName = null) {
    const key = this.getKey(instance, phone);
    this.cache.set(key, {
      chatId: chatId,
      instance: instance,
      phone: phone,
      contactName: contactName,
      createdAt: new Date().toISOString()
    });
    logger.info(`✅ Chat salvo: ${instance}:${phone} -> ${chatId}`);
    return this.cache.get(key);
  }

  get(instance, phone) {
    return this.cache.get(this.getKey(instance, phone));
  }
}

// ==================== Bitrix24 Service (Usando Chat comum) ====================
class Bitrix24Service {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async callMethod(method, params = {}) {
    try {
      const url = `${this.webhookUrl}${method}`;
      logger.info(`📞 Chamando Bitrix24: ${method}`);
      logger.debug(`URL: ${url}`);
      
      const response = await axios.post(url, params, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(`Bitrix24 Error: ${JSON.stringify(response.data.error)}`);
      }
      
      return response.data.result;
    } catch (error) {
      logger.error(`❌ Bitrix24 falhou: ${method} - ${error.message}`);
      if (error.response?.data) {
        logger.error(`Detalhes: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async findOrCreateChat(phone, instanceName, contactName = null) {
    try {
      const chatTitle = `WhatsApp ${phone} (${instanceName})`;
      const chatUsers = [1]; // ID do usuário atual (admin)
      
      // Tentar buscar chats existentes
      const existingChats = await this.callMethod('im.chat.list', {
        filter: { TITLE: chatTitle }
      });
      
      if (existingChats && existingChats.length > 0) {
        logger.info(`✅ Chat existente encontrado: ${existingChats[0].ID}`);
        return existingChats[0].ID;
      }
      
      // Criar novo chat
      logger.info(`🆕 Criando novo chat: ${chatTitle}`);
      const newChat = await this.callMethod('im.chat.add', {
        TITLE: chatTitle,
        USERS: chatUsers,
        DESCRIPTION: `Chat automático do WhatsApp - Instância: ${instanceName}\nCliente: ${contactName || phone}`
      });
      
      logger.info(`✅ Chat criado: ${newChat}`);
      return newChat;
      
    } catch (error) {
      logger.error(`Erro ao criar chat: ${error.message}`);
      throw error;
    }
  }

  async sendMessage(chatId, message, contactName = null) {
    if (!message || message.trim() === '') {
      logger.warn(`⚠️ Mensagem vazia ignorada`);
      return;
    }

    let formattedMessage = message;
    if (contactName) {
      formattedMessage = `👤 *${contactName}*\n${message}`;
    }

    const params = {
      DIALOG_ID: `chat${chatId}`,
      MESSAGE: formattedMessage,
      SYSTEM: 'N'
    };
    
    logger.info(`📤 Enviando mensagem para chat: ${chatId}`);
    const result = await this.callMethod('im.message.add', params);
    logger.info(`✅ Mensagem enviada ao Bitrix24!`);
    return result;
  }
}

// ==================== Evolution API Handler ====================
class EvolutionWebhookHandler {
  constructor(bitrixService, sessionManager) {
    this.bitrixService = bitrixService;
    this.sessionManager = sessionManager;
  }

  async processMessage(instanceName, webhookData) {
    try {
      logger.info(`========================================`);
      logger.info(`📨 Mensagem recebida - Instância: ${instanceName}`);
      
      let messageData = webhookData.data || webhookData;
      let message = null;
      let phone = null;
      let contactName = null;
      
      // Extrair telefone
      if (messageData.key?.remoteJid) {
        phone = messageData.key.remoteJid.split('@')[0];
      } else if (messageData.from) {
        phone = messageData.from.split('@')[0];
      } else if (messageData.sender) {
        phone = messageData.sender.split('@')[0];
      }
      
      // Extrair nome
      contactName = messageData.pushName || messageData.notifyName || messageData.senderName || null;
      
      // Extrair mensagem
      if (messageData.message?.conversation) {
        message = messageData.message.conversation;
      } else if (messageData.message?.extendedTextMessage?.text) {
        message = messageData.message.extendedTextMessage.text;
      } else if (messageData.body) {
        message = messageData.body;
      } else if (messageData.text) {
        message = messageData.text;
      } else {
        message = "📱 Mensagem recebida";
      }
      
      if (!phone) {
        logger.error(`❌ Não foi possível extrair o telefone!`);
        return;
      }
      
      logger.info(`📱 Telefone: ${phone}`);
      logger.info(`👤 Nome: ${contactName || 'Não informado'}`);
      logger.info(`💬 Mensagem: ${message.substring(0, 100)}`);
      
      // Verificar cache
      let session = this.sessionManager.get(instanceName, phone);
      let chatId = null;
      
      if (session) {
        chatId = session.chatId;
        logger.info(`📝 Chat encontrado na CACHE: ${chatId}`);
      } else {
        logger.info(`🆕 Criando/ Buscando chat no Bitrix24...`);
        chatId = await this.bitrixService.findOrCreateChat(phone, instanceName, contactName);
        session = this.sessionManager.set(instanceName, phone, chatId, contactName);
      }
      
      // Enviar mensagem
      await this.bitrixService.sendMessage(chatId, message, contactName);
      
      logger.info(`✅✅✅ MENSAGEM ENVIADA AO BITRIX24! ✅✅✅`);
      logger.info(`========================================\n`);
      
    } catch (error) {
      logger.error(`❌❌❌ ERRO: ${error.message} ❌❌❌`);
    }
  }
}

// ==================== Express App ====================
const app = express();
const sessionManager = new ChatSessionManager();
const bitrixService = new Bitrix24Service(process.env.BITRIX_WEBHOOK);
const webhookHandler = new EvolutionWebhookHandler(bitrixService, sessionManager);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== Routes ====================

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp CRM Integration',
    version: '2.0 - Chat Comum',
    endpoints: {
      health: 'GET /health',
      webhook: 'POST /webhook/evolution/:instanceName',
      sessions: 'GET /api/sessions',
      test: 'GET /api/test'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    activeSessions: sessionManager.cache.keys().length,
    bitrix_configured: !!process.env.BITRIX_WEBHOOK
  });
});

// Webhook principal
app.post('/webhook/evolution/:instanceName', async (req, res) => {
  const { instanceName } = req.params;
  
  try {
    logger.info(`🔔 Webhook recebido para: ${instanceName}`);
    await webhookHandler.processMessage(instanceName, req.body);
    res.status(200).json({ 
      status: 'success', 
      message: 'Mensagem processada',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Erro no webhook: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Endpoint de teste
app.get('/api/test', async (req, res) => {
  const testMessage = {
    event: "messages.upsert",
    data: {
      key: { remoteJid: "5588999999999@s.whatsapp.net" },
      pushName: "Cliente Teste",
      message: { conversation: "Olá! Esta é uma mensagem de teste do sistema." }
    }
  };
  
  try {
    await webhookHandler.processMessage('instance1', testMessage);
    res.json({ 
      success: true, 
      message: 'Teste executado com sucesso. Verifique o Bitrix24!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/sessions', (req, res) => {
  const sessions = sessionManager.cache.keys().reduce((acc, key) => {
    acc[key] = sessionManager.cache.get(key);
    return acc;
  }, {});
  
  res.json({
    total: Object.keys(sessions).length,
    sessions: sessions
  });
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('🚀 WhatsApp CRM Integration v2.0');
  console.log('========================================');
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: https://whatsapp-crm-ewix.onrender.com`);
  console.log(`❤️  Health: GET /health`);
  console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
  console.log(`🧪 Teste: GET /api/test`);
  console.log(`💬 Modo: Chat Comum do Bitrix24`);
  console.log('========================================\n');
  
  logger.info(`✅ Bitrix24 Webhook: ${process.env.BITRIX_WEBHOOK ? 'Configurado' : 'FALTANDO!'}`);
});