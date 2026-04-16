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
const path = require('path');
const NodeCache = require('node-cache');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==================== Cache separado por instância ====================
class MultiInstanceCache {
    constructor() {
        this.conversations = {};
        this.messages = {};
        
        // Inicializa cache para cada instância
        for (let i = 1; i <= 7; i++) {
            this.conversations[`instance${i}`] = new NodeCache({ stdTTL: 86400 });
            this.messages[`instance${i}`] = new NodeCache({ stdTTL: 86400 });
        }
    }

    saveMessage(instanceName, phone, message, direction, contactName = null) {
        const key = `${phone}_messages`;
        const existingMessages = this.messages[instanceName].get(key) || [];
        
        existingMessages.push({
            id: Date.now(),
            message: message,
            direction: direction,
            timestamp: new Date().toISOString(),
            status: direction === 'outbound' ? 'sent' : 'received'
        });
        
        this.messages[instanceName].set(key, existingMessages.slice(-200));
        
        // Atualizar conversa
        let conversation = this.conversations[instanceName].get(phone);
        if (!conversation) {
            conversation = {
                phone: phone,
                name: contactName || phone,
                instanceName: instanceName,
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
        this.conversations[instanceName].set(phone, conversation);
        
        console.log(`💾 [${instanceName}] Mensagem salva: ${direction} - ${phone}`);
        return true;
    }

    getConversations(instanceName = null) {
        const result = [];
        
        if (instanceName) {
            const keys = this.conversations[instanceName].keys();
            for (const key of keys) {
                const conv = this.conversations[instanceName].get(key);
                if (conv) result.push(conv);
            }
        } else {
            for (let i = 1; i <= 7; i++) {
                const instName = `instance${i}`;
                const keys = this.conversations[instName].keys();
                for (const key of keys) {
                    const conv = this.conversations[instName].get(key);
                    if (conv) result.push(conv);
                }
            }
        }
        
        return result.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    }

    getMessages(instanceName, phone) {
        const key = `${phone}_messages`;
        return this.messages[instanceName].get(key) || [];
    }

    markAsRead(instanceName, phone) {
        const conversation = this.conversations[instanceName].get(phone);
        if (conversation) {
            conversation.unreadCount = 0;
            this.conversations[instanceName].set(phone, conversation);
        }
    }
}

// ==================== Configuração das Instâncias ====================
const instances = {
    instance1: {
        id: process.env.INSTANCE_1_ID || '464c3279-6c01-4a14-a69b-0a186a4b33c6',
        apiKey: process.env.INSTANCE_1_API_KEY,
        name: 'WhatsApp Vendas',
        phone: '+55 88 981118927'
    },
    instance2: {
        id: process.env.INSTANCE_2_ID,
        apiKey: process.env.INSTANCE_2_API_KEY,
        name: 'WhatsApp Suporte',
        phone: '+55 11 99999-9992'
    },
    instance3: {
        id: process.env.INSTANCE_3_ID,
        apiKey: process.env.INSTANCE_3_API_KEY,
        name: 'WhatsApp Financeiro',
        phone: '+55 11 99999-9993'
    },
    instance4: {
        id: process.env.INSTANCE_4_ID,
        apiKey: process.env.INSTANCE_4_API_KEY,
        name: 'WhatsApp Atendimento',
        phone: '+55 11 99999-9994'
    },
    instance5: {
        id: process.env.INSTANCE_5_ID,
        apiKey: process.env.INSTANCE_5_API_KEY,
        name: 'WhatsApp Comercial',
        phone: '+55 11 99999-9995'
    },
    instance6: {
        id: process.env.INSTANCE_6_ID,
        apiKey: process.env.INSTANCE_6_API_KEY,
        name: 'WhatsApp Marketing',
        phone: '+55 11 99999-9996'
    },
    instance7: {
        id: process.env.INSTANCE_7_ID,
        apiKey: process.env.INSTANCE_7_API_KEY,
        name: 'WhatsApp SAC',
        phone: '+55 11 99999-9997'
    }
};

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://129.121.54.24:8080';
const cache = new MultiInstanceCache();

// ==================== Helper: Extrair dados da mensagem ====================
function extractMessageData(webhookData) {
    const messageData = webhookData.data || webhookData;
    let phone = null;
    let message = null;
    let contactName = null;
    
    // Extrair telefone
    if (messageData.key?.remoteJid) {
        const remoteJid = messageData.key.remoteJid;
        if (remoteJid.includes('@g.us')) {
            return { ignore: true, reason: 'group' };
        }
        phone = remoteJid.split('@')[0];
        contactName = messageData.pushName || messageData.notifyName || phone;
    } else if (messageData.sender) {
        phone = messageData.sender.split('@')[0];
        contactName = messageData.pushName || phone;
    }
    
    // Ignorar reações
    if (messageData.messageType === 'reactionMessage') {
        return { ignore: true, reason: 'reaction' };
    }
    
    // Extrair mensagem
    if (messageData.message?.conversation) {
        message = messageData.message.conversation;
    } else if (messageData.message?.extendedTextMessage?.text) {
        message = messageData.message.extendedTextMessage.text;
    } else if (messageData.message?.imageMessage?.caption) {
        message = `📷 Imagem: ${messageData.message.imageMessage.caption}`;
    } else if (messageData.message?.imageMessage) {
        message = `📷 Imagem recebida`;
    } else if (messageData.message?.audioMessage) {
        message = `🎵 Áudio recebido`;
    } else if (messageData.message?.videoMessage) {
        message = `🎥 Vídeo recebido`;
    } else if (messageData.body) {
        message = messageData.body;
    } else {
        message = null;
    }
    
    return { phone, message, contactName, ignore: false };
}

// ==================== Webhook para todas as instâncias ====================
app.post('/webhook/evolution/:instanceName', (req, res) => {
    const { instanceName } = req.params;
    const webhookData = req.body;
    
    console.log(`📨 Webhook recebido para: ${instanceName}`);
    
    // Verificar se instância existe
    if (!instances[instanceName]) {
        console.log(`⚠️ Instância desconhecida: ${instanceName}`);
        return res.status(200).json({ status: 'ignored', reason: 'unknown_instance' });
    }
    
    const { phone, message, contactName, ignore, reason } = extractMessageData(webhookData);
    
    if (ignore) {
        console.log(`🚫 Ignorando: ${reason}`);
        return res.status(200).json({ status: 'ignored', reason });
    }
    
    if (!phone || !message) {
        console.log(`⚠️ Não foi possível extrair dados`);
        return res.status(200).json({ status: 'ignored', reason: 'no_data' });
    }
    
    console.log(`✅ ${instanceName} - ${contactName} (${phone}): ${message.substring(0, 50)}`);
    
    // Salvar no cache da instância correta
    cache.saveMessage(instanceName, phone, message, 'inbound', contactName);
    
    res.status(200).json({ status: 'success' });
});

// ==================== Rotas da API ====================

// Listar conversas (com filtro por instância)
app.get('/api/conversations', (req, res) => {
    const { instance } = req.query;
    const conversations = cache.getConversations(instance);
    res.json({ conversations });
});

// Listar mensagens de uma conversa
app.get('/api/messages', (req, res) => {
    const { instanceName, phone } = req.query;
    
    if (!instanceName || !phone) {
        return res.status(400).json({ error: 'instanceName e phone são obrigatórios' });
    }
    
    const messages = cache.getMessages(instanceName, phone);
    res.json({ messages });
});

// Enviar mensagem
app.post('/api/send', async (req, res) => {
    const { instanceName, phone, message } = req.body;
    
    if (!instanceName || !phone || !message) {
        return res.status(400).json({ error: 'instanceName, phone e message são obrigatórios' });
    }
    
    const instance = instances[instanceName];
    if (!instance || !instance.id || !instance.apiKey) {
        return res.status(400).json({ error: `Instância ${instanceName} não configurada` });
    }
    
    try {
        // Enviar via Evolution API
        const response = await axios.post(
            `${EVOLUTION_URL}/message/sendText/${instance.id}`,
            { number: phone, text: message, options: { delay: 1000 } },
            { headers: { 'apikey': instance.apiKey, 'Content-Type': 'application/json' } }
        );
        
        // Salvar mensagem enviada
        cache.saveMessage(instanceName, phone, message, 'outbound');
        
        console.log(`📤 [${instanceName}] Mensagem enviada para ${phone}`);
        res.json({ success: true });
    } catch (error) {
        console.error(`Erro ao enviar [${instanceName}]:`, error.message);
        res.status(500).json({ error: 'Erro ao enviar mensagem: ' + error.message });
    }
});

// Marcar como lida
app.post('/api/mark-read', (req, res) => {
    const { instanceName, phone } = req.body;
    cache.markAsRead(instanceName, phone);
    res.json({ success: true });
});

// Interface do chat
app.get('/whatsapp-chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'whatsapp-chat.html'));
});

// Health check
app.get('/health', (req, res) => {
    const instancesStatus = {};
    for (let i = 1; i <= 7; i++) {
        const instName = `instance${i}`;
        instancesStatus[instName] = {
            configured: !!instances[instName]?.id,
            conversations: cache.conversations[instName]?.keys()?.length || 0
        };
    }
    
    res.json({
        status: 'online',
        instances: instancesStatus,
        timestamp: new Date().toISOString()
    });
});

// ==================== Start ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`🚀 WhatsApp CRM - Multi Instâncias`);
    console.log(`========================================`);
    console.log(`📡 Porta: ${PORT}`);
    console.log(`📱 Interface: /whatsapp-chat`);
    console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
    console.log(`========================================`);
    console.log(`📋 Instâncias configuradas:`);
    for (let i = 1; i <= 7; i++) {
        const instName = `instance${i}`;
        const inst = instances[instName];
        if (inst?.id && inst?.apiKey) {
            console.log(`   ✅ ${instName}: ${inst.name} - ${inst.phone}`);
        } else {
            console.log(`   ⚠️ ${instName}: Não configurada`);
        }
    }
    console.log(`========================================\n`);
});