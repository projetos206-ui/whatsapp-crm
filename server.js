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
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'messages.log' })
  ]
});

// ==================== Cache para CHAT_IDs ====================
class ChatSessionManager {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
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
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString()
    });
    logger.info(`✅ Chat salvo/atualizado: ${instance}:${phone} -> CHAT_ID: ${chatId}`);
    return this.cache.get(key);
  }

  get(instance, phone) {
    const key = this.getKey(instance, phone);
    const session = this.cache.get(key);
    if (session) {
      session.lastMessageAt = new Date().toISOString();
      this.cache.set(key, session);
    }
    return session;
  }

  updateContactName(instance, phone, contactName) {
    const session = this.get(instance, phone);
    if (session && !session.contactName) {
      session.contactName = contactName;
      this.set(instance, phone, session.chatId, contactName);
      logger.info(`📝 Nome do contato atualizado: ${phone} -> ${contactName}`);
    }
  }

  getAll() {
    return this.cache.keys().reduce((acc, key) => {
      acc[key] = this.cache.get(key);
      return acc;
    }, {});
  }
}

// ==================== Bitrix24 Service ====================
class Bitrix24Service {
  constructor(webhookUrl, lineId) {
    this.webhookUrl = webhookUrl;
    this.lineId = lineId;
  }

  async callMethod(method, params = {}) {
    try {
      const url = `${this.webhookUrl}${method}`;
      logger.debug(`Chamando Bitrix24: ${method}`);
      
      const response = await axios.post(url, params, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(`Bitrix24 Error: ${JSON.stringify(response.data.error)}`);
      }
      
      return response.data.result;
    } catch (error) {
      logger.error(`Bitrix24 API falhou: ${method}`, { error: error.message });
      throw error;
    }
  }

  async findExistingChat(phone, instanceName) {
    try {
      // Buscar sessões existentes pelo USER_CODE
      const userCode = `${instanceName}_${phone}`;
      const result = await this.callMethod('imopenlines.session.list', {
        filter: { USER_CODE: userCode },
        order: { DATE_CREATE: 'DESC' },
        limit: 1
      });
      
      if (result && result.length > 0) {
        logger.info(`✅ Chat existente encontrado: ${result[0].CHAT_ID}`);
        return result[0].CHAT_ID;
      }
      
      return null;
    } catch (error) {
      logger.warn(`Erro ao buscar chat existente: ${error.message}`);
      return null;
    }
  }

  async createChatSession(phone, instanceName, contactName = null) {
    try {
      const formattedPhone = phone.replace(/[^0-9]/g, '');
      const userName = contactName ? contactName : `WhatsApp ${formattedPhone}`;
      
      const params = {
        LINE_ID: this.lineId,
        USER_CODE: `${instanceName}_${formattedPhone}`,
        USER_NAME: userName,
        USER_FIRST_NAME: contactName || "WhatsApp",
        USER_LAST_NAME: formattedPhone,
        USER_WORK_POSITION: `WhatsApp - Instância: ${instanceName}`
      };
      
      logger.info(`🆕 Criando nova sessão para ${instanceName}:${formattedPhone}`);
      const result = await this.callMethod('imopenlines.session.start', params);
      
      if (result && result.CHAT_ID) {
        logger.info(`✅ Sessão criada: CHAT_ID ${result.CHAT_ID}`);
        return result.CHAT_ID;
      } else {
        throw new Error('CHAT_ID não retornado');
      }
    } catch (error) {
      logger.error(`Erro ao criar sessão: ${error.message}`);
      throw error;
    }
  }

  async sendMessage(chatId, message, contactName = null) {
    if (!message || message.trim() === '') {
      logger.warn(`Mensagem vazia ignorada`);
      return;
    }

    // Formatar mensagem com nome do contato se disponível
    let formattedMessage = message;
    if (contactName) {
      formattedMessage = `*${contactName}:*\n${message}`;
    }

    const params = {
      CHAT_ID: chatId,
      MESSAGE: formattedMessage,
      SYSTEM: 'N'
    };
    
    const result = await this.callMethod('imopenlines.message.add', params);
    logger.info(`✅ Mensagem enviada ao Bitrix24 - Chat: ${chatId}`);
    return result;
  }
}

// ==================== Evolution API Webhook Handler ====================
class EvolutionWebhookHandler {
  constructor(bitrixService, sessionManager) {
    this.bitrixService = bitrixService;
    this.sessionManager = sessionManager;
  }

  async extractContactName(messageData) {
    // Tentar extrair nome do contato de diferentes lugares
    let contactName = null;
    
    if (messageData.pushName) {
      contactName = messageData.pushName;
    } else if (messageData.notifyName) {
      contactName = messageData.notifyName;
    } else if (messageData.senderName) {
      contactName = messageData.senderName;
    } else if (messageData.contactName) {
      contactName = messageData.contactName;
    }
    
    return contactName;
  }

  async processMessage(instanceName, webhookData) {
    try {
      logger.info(`📨 Webhook recebido - Instância: ${instanceName}`);
      
      let messageData = webhookData.data || webhookData;
      let message = null;
      let phone = null;
      let contactName = null;
      let isGroup = false;
      
      // Verificar se é grupo
      if (messageData.key?.remoteJid?.includes('@g.us')) {
        isGroup = true;
        logger.info(`🚫 Ignorando mensagem de grupo`);
        return;
      }
      
      // Extrair número do telefone
      if (messageData.key?.remoteJid) {
        phone = messageData.key.remoteJid.split('@')[0];
      } else if (messageData.from) {
        phone = messageData.from.split('@')[0];
      } else if (messageData.sender) {
        phone = messageData.sender.split('@')[0];
      }
      
      // Extrair nome do contato
      contactName = await this.extractContactName(messageData);
      
      // Extrair texto da mensagem
      if (messageData.message) {
        if (messageData.message.conversation) {
          message = messageData.message.conversation;
        } else if (messageData.message.extendedTextMessage?.text) {
          message = messageData.message.extendedTextMessage.text;
        } else if (messageData.message.imageMessage) {
          message = `📷 *Imagem*\n${messageData.message.imageMessage.caption || 'Sem legenda'}`;
        } else if (messageData.message.videoMessage) {
          message = `🎥 *Vídeo*\n${messageData.message.videoMessage.caption || 'Sem legenda'}`;
        } else if (messageData.message.audioMessage) {
          message = `🎵 *Áudio*`;
        } else if (messageData.message.documentMessage) {
          message = `📄 *Documento*\n${messageData.message.documentMessage.fileName || 'Arquivo'}`;
        } else {
          message = `📱 *Mensagem recebida*`;
        }
      } else if (messageData.body) {
        message = messageData.body;
      } else if (messageData.text) {
        message = messageData.text;
      }
      
      if (!phone) {
        logger.error(`❌ Não foi possível extrair telefone`);
        return;
      }
      
      if (!message) {
        message = `📱 *Mensagem recebida*`;
      }
      
      logger.info(`📱 Telefone: ${phone}`);
      if (contactName) logger.info(`👤 Nome: ${contactName}`);
      logger.info(`💬 Mensagem: ${message.substring(0, 100)}`);
      
      // Verificar se já existe chat
      let session = this.sessionManager.get(instanceName, phone);
      let chatId = null;
      
      if (session) {
        // Chat já existe na cache
        chatId = session.chatId;
        logger.info(`📝 Chat existente encontrado na cache: ${chatId}`);
        
        // Atualizar nome do contato se não tiver
        if (contactName && !session.contactName) {
          this.sessionManager.updateContactName(instanceName, phone, contactName);
        }
      } else {
        // Buscar no Bitrix24 se já existe chat
        logger.info(`🔍 Buscando chat existente no Bitrix24...`);
        chatId = await this.bitrixService.findExistingChat(phone, instanceName);
        
        if (chatId) {
          // Chat existe no Bitrix24
          logger.info(`✅ Chat existente encontrado no Bitrix24: ${chatId}`);
          session = this.sessionManager.set(instanceName, phone, chatId, contactName);
        } else {
          // Criar novo chat
          logger.info(`🆕 Nenhum chat existente, criando novo...`);
          chatId = await this.bitrixService.createChatSession(phone, instanceName, contactName);
          session = this.sessionManager.set(instanceName, phone, chatId, contactName);
        }
      }
      
      // Enviar mensagem para o chat (sem criar novo contato)
      await this.bitrixService.sendMessage(chatId, message, contactName);
      
      logger.info(`✅ Mensagem enviada ao CRM - Chat: ${chatId}`);
      
    } catch (error) {
      logger.error(`❌ Erro ao processar mensagem: ${error.message}`);
    }
  }
}

// ==================== Express App ====================
const app = express();
const sessionManager = new ChatSessionManager();
const bitrixService = new Bitrix24Service(
  process.env.BITRIX_WEBHOOK,
  process.env.BITRIX_LINE_ID
);
const webhookHandler = new EvolutionWebhookHandler(bitrixService, sessionManager);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ==================== Routes ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    activeChats: Object.keys(sessionManager.getAll()).length,
    bitrix_configured: !!process.env.BITRIX_WEBHOOK,
    line_id: process.env.BITRIX_LINE_ID
  });
});

// Webhook para Evolution API
app.post('/webhook/evolution/:instanceName', async (req, res) => {
  const { instanceName } = req.params;
  
  try {
    logger.info(`📨 Webhook recebido para instância: ${instanceName}`);
    
    // Processar mensagem
    await webhookHandler.processMessage(instanceName, req.body);
    
    // Responder 200 para o Evolution API
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

// Listar todas as sessões ativas
app.get('/api/sessions', (req, res) => {
  const sessions = sessionManager.getAll();
  res.json({
    total: Object.keys(sessions).length,
    sessions: sessions
  });
});

// Limpar cache (útil para testes)
app.post('/api/clear-cache', (req, res) => {
  sessionManager.cache.flushAll();
  logger.info('🗑️ Cache limpo');
  res.json({ status: 'success', message: 'Cache limpo' });
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 Servidor iniciado na porta ${PORT}`);
  logger.info(`📋 Configuração:`);
  logger.info(`   - Bitrix24 Webhook: ${process.env.BITRIX_WEBHOOK ? '✅' : '❌'}`);
  logger.info(`   - LINE_ID: ${process.env.BITRIX_LINE_ID || '❌'}`);
  logger.info(`\n📌 Endpoints:`);
  logger.info(`   POST /webhook/evolution/:instanceName`);
  logger.info(`   GET /health`);
  logger.info(`   GET /api/sessions`);
});

module.exports = app;