// const express = require('express');
// const axios = require('axios');
// const dotenv = require('dotenv');
// const NodeCache = require('node-cache');
// const winston = require('winston');

// dotenv.config();

// // ==================== Logger ====================
// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf(({ timestamp, level, message, ...meta }) => {
//       return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
//     })
//   ),
//   transports: [
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.colorize(),
//         winston.format.simple()
//       )
//     })
//   ]
// });

// // ==================== Aumentar limite ====================
// const app = express();
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// // ==================== Cache para sessões do Open Channel ====================
// class SessionManager {
//   constructor() {
//     this.cache = new NodeCache({ stdTTL: 86400 });
//   }

//   set(phone, chatId, contactName) {
//     this.cache.set(phone, {
//       chatId: chatId,
//       phone: phone,
//       name: contactName,
//       createdAt: new Date().toISOString()
//     });
//     logger.info(`✅ Sessão salva: ${phone} -> CHAT_ID: ${chatId}`);
//     return this.cache.get(phone);
//   }

//   get(phone) {
//     return this.cache.get(phone);
//   }
// }

// // ==================== Bitrix24 Open Channel Service ====================
// class Bitrix24OpenChannelService {
//   constructor(webhookUrl, lineId) {
//     this.webhookUrl = webhookUrl;
//     this.lineId = lineId;
//   }

//   async callMethod(method, params = {}) {
//     try {
//       const url = `${this.webhookUrl}${method}`;
//       logger.info(`📞 Chamando Bitrix24: ${method}`);
//       logger.debug(`Params: ${JSON.stringify(params)}`);
      
//       const response = await axios.post(url, params, {
//         headers: { 'Content-Type': 'application/json' },
//         timeout: 30000
//       });
      
//       if (response.data.error) {
//         throw new Error(`Bitrix24 Error: ${JSON.stringify(response.data.error)}`);
//       }
      
//       logger.info(`✅ Bitrix24 respondeu: ${method}`);
//       return response.data.result;
//     } catch (error) {
//       logger.error(`❌ Bitrix24 falhou: ${method} - ${error.message}`);
//       if (error.response?.data) {
//         logger.error(`Detalhes: ${JSON.stringify(error.response.data)}`);
//       }
//       throw error;
//     }
//   }

//   async findOrCreateSession(phone, contactName) {
//     try {
//       const formattedPhone = phone.replace(/[^0-9]/g, '');
//       const userCode = `whatsapp_${formattedPhone}`;
      
//       logger.info(`🔍 Buscando/criando sessão para: ${userCode}`);
//       logger.info(`LINE_ID: ${this.lineId}`);
      
//       // Método correto para Open Channels
//       const result = await this.callMethod('imopenlines.session.start', {
//         LINE_ID: parseInt(this.lineId),
//         USER_CODE: userCode,
//         USER_NAME: contactName || formattedPhone,
//         USER_FIRST_NAME: contactName || "WhatsApp",
//         USER_LAST_NAME: formattedPhone,
//         USER_WORK_POSITION: `WhatsApp - ${formattedPhone}`
//       });
      
//       if (result && result.CHAT_ID) {
//         logger.info(`✅ Sessão encontrada/criada: CHAT_ID=${result.CHAT_ID}`);
//         return result.CHAT_ID;
//       } else {
//         throw new Error('CHAT_ID não retornado');
//       }
      
//     } catch (error) {
//       logger.error(`❌ Erro na sessão: ${error.message}`);
//       throw error;
//     }
//   }

//   async sendMessage(chatId, message, contactName) {
//     if (!message || message.trim() === '') {
//       logger.warn(`⚠️ Mensagem vazia ignorada`);
//       return;
//     }

//     // Formatar mensagem com nome do contato
//     const formattedMessage = `👤 *${contactName || 'Cliente'}*\n💬 ${message}`;
    
//     const params = {
//       CHAT_ID: chatId,
//       MESSAGE: formattedMessage,
//       SYSTEM: 'N'
//     };
    
//     logger.info(`📤 Enviando mensagem para CHAT: ${chatId}`);
//     const result = await this.callMethod('imopenlines.message.add', params);
//     logger.info(`✅ Mensagem enviada ao chat!`);
//     return result;
//   }
// }

// // ==================== Evolution API Handler ====================
// class EvolutionWebhookHandler {
//   constructor(bitrixService, sessionManager) {
//     this.bitrixService = bitrixService;
//     this.sessionManager = sessionManager;
//   }

//   isGroupMessage(remoteJid) {
//     return remoteJid && remoteJid.includes('@g.us');
//   }

//   extractMessageContent(messageData) {
//     if (messageData.conversation) {
//       return messageData.conversation;
//     }
//     if (messageData.extendedTextMessage?.text) {
//       return messageData.extendedTextMessage.text;
//     }
//     if (messageData.imageMessage?.caption) {
//       return `📷 Imagem: ${messageData.imageMessage.caption}`;
//     }
//     if (messageData.imageMessage && !messageData.imageMessage.caption) {
//       return `📷 Imagem recebida`;
//     }
//     if (messageData.videoMessage?.caption) {
//       return `🎥 Vídeo: ${messageData.videoMessage.caption}`;
//     }
//     if (messageData.videoMessage && !messageData.videoMessage.caption) {
//       return `🎥 Vídeo recebido`;
//     }
//     if (messageData.audioMessage) {
//       return `🎵 Áudio recebido`;
//     }
//     if (messageData.documentMessage) {
//       return `📄 Documento: ${messageData.documentMessage.fileName || 'arquivo'}`;
//     }
//     if (messageData.stickerMessage) {
//       return `🏷️ Sticker`;
//     }
//     return null;
//   }

//   async processMessage(instanceName, webhookData) {
//     try {
//       let messageData = webhookData.data || webhookData;
//       let message = null;
//       let phone = null;
//       let contactName = null;
//       let isGroup = false;
      
//       // Extrair telefone
//       if (messageData.key?.remoteJid) {
//         const remoteJid = messageData.key.remoteJid;
//         isGroup = this.isGroupMessage(remoteJid);
        
//         if (isGroup) {
//           logger.info(`🚫 Ignorando mensagem de grupo: ${remoteJid}`);
//           return;
//         }
        
//         phone = remoteJid.split('@')[0];
//         contactName = messageData.pushName || messageData.notifyName || `Contato ${phone}`;
//       } else if (messageData.from) {
//         phone = messageData.from.split('@')[0];
//         contactName = messageData.pushName || `Contato ${phone}`;
//       }
      
//       // Extrair mensagem
//       if (messageData.message) {
//         message = this.extractMessageContent(messageData.message);
//       }
      
//       if (!message && messageData.body) {
//         message = messageData.body;
//       }
      
//       if (!message && messageData.text) {
//         message = messageData.text;
//       }
      
//       if (!message) {
//         message = "📱 Mensagem recebida";
//       }
      
//       // Limitar tamanho
//       if (message.length > 500) {
//         message = message.substring(0, 500) + "...";
//       }
      
//       if (!phone) {
//         logger.warn(`⚠️ Não foi possível extrair telefone`);
//         return;
//       }
      
//       logger.info(`========================================`);
//       logger.info(`📨 Nova mensagem de: ${phone}`);
//       logger.info(`👤 Nome: ${contactName}`);
//       logger.info(`💬 Mensagem: ${message}`);
//       logger.info(`📡 Instância: ${instanceName}`);
      
//       // Verificar sessão existente
//       let session = this.sessionManager.get(phone);
//       let chatId = null;
      
//       if (session) {
//         chatId = session.chatId;
//         logger.info(`📝 Sessão encontrada na cache: ${chatId}`);
//       } else {
//         logger.info(`🆕 Criando nova sessão no Open Channel...`);
//         chatId = await this.bitrixService.findOrCreateSession(phone, contactName);
//         session = this.sessionManager.set(phone, chatId, contactName);
//       }
      
//       // Enviar mensagem para o Open Channel
//       await this.bitrixService.sendMessage(chatId, message, contactName);
      
//       logger.info(`✅✅✅ MENSAGEM ENVIADA AO OPEN CHANNEL! ✅✅✅`);
//       logger.info(`📊 CHAT_ID: ${chatId}`);
//       logger.info(`========================================\n`);
      
//     } catch (error) {
//       logger.error(`❌ ERRO: ${error.message}`);
//     }
//   }
// }

// // ==================== Routes ====================
// const sessionManager = new SessionManager();
// const bitrixService = new Bitrix24OpenChannelService(
//   process.env.BITRIX_WEBHOOK,
//   process.env.BITRIX_LINE_ID
// );
// const webhookHandler = new EvolutionWebhookHandler(bitrixService, sessionManager);

// app.get('/', (req, res) => {
//   res.json({
//     status: 'online',
//     service: 'WhatsApp → Bitrix24 Open Channel',
//     mode: 'Enviando para OPEN CHANNEL (Bate-papo ao vivo)',
//     endpoints: {
//       health: 'GET /health',
//       webhook: 'POST /webhook/evolution/:instanceName',
//       sessions: 'GET /api/sessions'
//     }
//   });
// });

// app.get('/health', (req, res) => {
//   res.json({
//     status: 'online',
//     timestamp: new Date().toISOString(),
//     activeSessions: sessionManager.cache.keys().length,
//     bitrix_configured: !!process.env.BITRIX_WEBHOOK,
//     line_id: process.env.BITRIX_LINE_ID
//   });
// });

// // Webhook principal
// app.post('/webhook/evolution/:instanceName', async (req, res) => {
//   const { instanceName } = req.params;
  
//   try {
//     logger.info(`🔔 Webhook recebido para: ${instanceName}`);
//     await webhookHandler.processMessage(instanceName, req.body);
//     res.status(200).json({ 
//       status: 'success', 
//       message: 'Mensagem enviada ao Open Channel',
//       timestamp: new Date().toISOString()
//     });
//   } catch (error) {
//     logger.error(`Erro: ${error.message}`);
//     res.status(500).json({ status: 'error', message: error.message });
//   }
// });

// // Ver sessões ativas
// app.get('/api/sessions', (req, res) => {
//   const sessions = sessionManager.cache.keys().reduce((acc, key) => {
//     acc[key] = sessionManager.cache.get(key);
//     return acc;
//   }, {});
  
//   res.json({
//     total: Object.keys(sessions).length,
//     sessions: sessions
//   });
// });

// // ==================== Start Server ====================
// const PORT = process.env.PORT || 3000;

// app.listen(PORT, '0.0.0.0', () => {
//   console.log('\n========================================');
//   console.log('🚀 WhatsApp → Bitrix24 Open Channel');
//   console.log('========================================');
//   console.log(`📡 Servidor: https://whatsapp-crm-ewix.onrender.com`);
//   console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
//   console.log(`💬 Modo: Enviando para OPEN CHANNEL`);
//   console.log(`🆔 LINE_ID: ${process.env.BITRIX_LINE_ID || 'NÃO CONFIGURADO'}`);
//   console.log(`✅ Status: FUNCIONANDO`);
//   console.log('========================================\n');
// });


const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

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

// ==================== Aumentar limite ====================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos
app.use(express.static('public'));

// ==================== Cache para mensagens e conversas ====================
class MessageStorage {
  constructor() {
    this.conversations = new NodeCache({ stdTTL: 86400 });
    this.messages = new NodeCache({ stdTTL: 86400 });
  }

  // Salvar uma nova mensagem
  saveMessage(phone, message, direction, contactName = null) {
    const messageObj = {
      id: Date.now(),
      phone: phone,
      contactName: contactName,
      message: message,
      direction: direction, // 'inbound' (recebida) ou 'outbound' (enviada)
      timestamp: new Date().toISOString(),
      read: false
    };

    // Salvar mensagem
    const key = `${phone}_messages`;
    const existingMessages = this.messages.get(key) || [];
    existingMessages.push(messageObj);
    this.messages.set(key, existingMessages.slice(-200)); // Mantém últimas 200 mensagens

    // Atualizar conversa
    let conversation = this.conversations.get(phone);
    if (!conversation) {
      conversation = {
        phone: phone,
        name: contactName || phone,
        lastMessage: message,
        lastTime: new Date().toISOString(),
        unreadCount: direction === 'inbound' ? 1 : 0
      };
    } else {
      conversation.lastMessage = message;
      conversation.lastTime = new Date().toISOString();
      if (direction === 'inbound') {
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      }
      if (contactName && !conversation.name) {
        conversation.name = contactName;
      }
    }
    this.conversations.set(phone, conversation);

    logger.info(`💾 Mensagem salva: ${direction} - ${phone} - ${message.substring(0, 50)}`);
    return messageObj;
  }

  // Buscar todas as conversas
  getConversations() {
    const result = [];
    const keys = this.conversations.keys();
    for (const key of keys) {
      const conv = this.conversations.get(key);
      if (conv) result.push(conv);
    }
    return result.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
  }

  // Buscar mensagens de uma conversa
  getMessages(phone) {
    const key = `${phone}_messages`;
    return this.messages.get(key) || [];
  }

  // Marcar conversa como lida
  markAsRead(phone) {
    const conversation = this.conversations.get(phone);
    if (conversation) {
      conversation.unreadCount = 0;
      this.conversations.set(phone, conversation);
    }
  }

  // Atualizar nome do contato
  updateContactName(phone, name) {
    const conversation = this.conversations.get(phone);
    if (conversation) {
      conversation.name = name;
      this.conversations.set(phone, conversation);
    }
  }
}

// ==================== Evolution API Service ====================
class EvolutionApiService {
  constructor(evolutionUrl, apiKey) {
    this.evolutionUrl = evolutionUrl;
    this.apiKey = apiKey;
  }

  async sendMessage(instanceName, phone, message) {
    try {
      const response = await axios.post(
        `${this.evolutionUrl}/message/sendText/${instanceName}`,
        {
          number: phone,
          text: message,
          options: { delay: 1000 }
        },
        {
          headers: {
            'apikey': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      logger.info(`📤 Mensagem enviada para ${phone}: ${message.substring(0, 50)}`);
      return response.data;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem para ${phone}: ${error.message}`);
      throw error;
    }
  }
}

// ==================== Evolution API Handler ====================
class EvolutionWebhookHandler {
  constructor(storage, evolutionService) {
    this.storage = storage;
    this.evolutionService = evolutionService;
  }

  isGroupMessage(remoteJid) {
    return remoteJid && remoteJid.includes('@g.us');
  }

  extractMessageContent(messageData) {
    if (messageData.conversation) {
      return messageData.conversation;
    }
    if (messageData.extendedTextMessage?.text) {
      return messageData.extendedTextMessage.text;
    }
    if (messageData.imageMessage?.caption) {
      return `📷 Imagem: ${messageData.imageMessage.caption}`;
    }
    if (messageData.imageMessage && !messageData.imageMessage.caption) {
      return `📷 Imagem recebida`;
    }
    if (messageData.videoMessage?.caption) {
      return `🎥 Vídeo: ${messageData.videoMessage.caption}`;
    }
    if (messageData.videoMessage && !messageData.videoMessage.caption) {
      return `🎥 Vídeo recebido`;
    }
    if (messageData.audioMessage) {
      return `🎵 Áudio recebido`;
    }
    if (messageData.documentMessage) {
      return `📄 Documento: ${messageData.documentMessage.fileName || 'arquivo'}`;
    }
    if (messageData.stickerMessage) {
      return `🏷️ Sticker`;
    }
    return null;
  }

  async processMessage(instanceName, webhookData) {
    try {
      let messageData = webhookData.data || webhookData;
      let message = null;
      let phone = null;
      let contactName = null;
      let isGroup = false;
      
      // Extrair telefone
      if (messageData.key?.remoteJid) {
        const remoteJid = messageData.key.remoteJid;
        isGroup = this.isGroupMessage(remoteJid);
        
        if (isGroup) {
          logger.info(`🚫 Ignorando mensagem de grupo: ${remoteJid}`);
          return;
        }
        
        phone = remoteJid.split('@')[0];
        contactName = messageData.pushName || messageData.notifyName || `Contato ${phone}`;
      } else if (messageData.from) {
        phone = messageData.from.split('@')[0];
        contactName = messageData.pushName || `Contato ${phone}`;
      }
      
      // Extrair mensagem
      if (messageData.message) {
        message = this.extractMessageContent(messageData.message);
      }
      
      if (!message && messageData.body) {
        message = messageData.body;
      }
      
      if (!message && messageData.text) {
        message = messageData.text;
      }
      
      if (!message) {
        message = "📱 Mensagem recebida";
      }
      
      // Limitar tamanho
      if (message.length > 500) {
        message = message.substring(0, 500) + "...";
      }
      
      if (!phone) {
        logger.warn(`⚠️ Não foi possível extrair telefone`);
        return;
      }
      
      logger.info(`========================================`);
      logger.info(`📨 Nova mensagem de: ${phone}`);
      logger.info(`👤 Nome: ${contactName}`);
      logger.info(`💬 Mensagem: ${message}`);
      logger.info(`📡 Instância: ${instanceName}`);
      
      // Salvar mensagem
      this.storage.saveMessage(phone, message, 'inbound', contactName);
      this.storage.updateContactName(phone, contactName);
      
      logger.info(`✅✅✅ MENSAGEM SALVA COM SUCESSO! ✅✅✅`);
      logger.info(`========================================\n`);
      
    } catch (error) {
      logger.error(`❌ ERRO: ${error.message}`);
    }
  }
}

// ==================== Inicialização ====================
const storage = new MessageStorage();
const evolutionService = new EvolutionApiService(
  process.env.EVOLUTION_URL,
  process.env.INSTANCE_1_API_KEY
);
const webhookHandler = new EvolutionWebhookHandler(storage, evolutionService);

// ==================== Rotas ====================

// Página inicial
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp CRM - Espelho WhatsApp',
    version: '2.0',
    endpoints: {
      chat: 'GET /whatsapp-chat',
      health: 'GET /health',
      webhook: 'POST /webhook/evolution/:instanceName',
      conversations: 'GET /api/conversations',
      messages: 'GET /api/messages',
      send: 'POST /api/send'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    conversations: storage.getConversations().length,
    evolution_configured: !!process.env.EVOLUTION_URL,
    version: '2.0'
  });
});

// Webhook principal da Evolution API
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
    logger.error(`Erro: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==================== API para a interface do WhatsApp ====================

// Listar todas as conversas
app.get('/api/conversations', (req, res) => {
  try {
    const conversations = storage.getConversations();
    res.json({ 
      success: true, 
      conversations: conversations 
    });
  } catch (error) {
    logger.error(`Erro ao listar conversas: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar mensagens de uma conversa
app.get('/api/messages', (req, res) => {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefone não informado' });
    }
    
    const messages = storage.getMessages(phone);
    storage.markAsRead(phone);
    
    res.json({ 
      success: true, 
      messages: messages 
    });
  } catch (error) {
    logger.error(`Erro ao listar mensagens: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enviar mensagem (do Bitrix24 para o WhatsApp)
app.post('/api/send', async (req, res) => {
  try {
    const { phone, message, instanceName = 'instance1' } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Telefone e mensagem são obrigatórios' });
    }
    
    // Obter o nome do contato
    const conversation = storage.getConversations().find(c => c.phone === phone);
    const contactName = conversation?.name || phone;
    
    // Enviar para Evolution API
    await evolutionService.sendMessage(instanceName, phone, message);
    
    // Salvar mensagem enviada
    storage.saveMessage(phone, message, 'outbound', contactName);
    
    logger.info(`✅ Mensagem enviada para ${phone}: ${message.substring(0, 50)}`);
    
    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Erro ao enviar mensagem: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Marcar conversa como lida
app.post('/api/mark-read', (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Telefone não informado' });
    }
    
    storage.markAsRead(phone);
    res.json({ success: true });
    
  } catch (error) {
    logger.error(`Erro ao marcar como lida: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Criar pasta public se não existir
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Rota para a interface do chat
app.get('/whatsapp-chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'whatsapp-chat.html'));
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('🚀 WhatsApp CRM - Espelho WhatsApp');
  console.log('========================================');
  console.log(`📡 Servidor: http://localhost:${PORT}`);
  console.log(`🌐 Interface: http://localhost:${PORT}/whatsapp-chat`);
  console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
  console.log(`💬 Modo: Interface Personalizada (WhatsApp Style)`);
  console.log(`✅ Status: FUNCIONANDO`);
  console.log('========================================\n');
  
  logger.info(`✅ Evolution URL: ${process.env.EVOLUTION_URL || 'NÃO CONFIGURADO'}`);
  logger.info(`✅ API Key: ${process.env.INSTANCE_1_API_KEY ? 'Configurada' : 'NÃO CONFIGURADA'}`);
});