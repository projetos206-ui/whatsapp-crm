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
const dotenv = require('dotenv');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ==================== WPPConnect - 7 Instâncias ====================
const sessions = {
    instance1: { session: 'vendas', name: 'WhatsApp Vendas', phone: '+55 11 99999-9991', status: 'disconnected', client: null, qrCode: null },
    instance2: { session: 'suporte', name: 'WhatsApp Suporte', phone: '+55 11 99999-9992', status: 'disconnected', client: null, qrCode: null },
    instance3: { session: 'financeiro', name: 'WhatsApp Financeiro', phone: '+55 11 99999-9993', status: 'disconnected', client: null, qrCode: null },
    instance4: { session: 'atendimento', name: 'WhatsApp Atendimento', phone: '+55 11 99999-9994', status: 'disconnected', client: null, qrCode: null },
    instance5: { session: 'comercial', name: 'WhatsApp Comercial', phone: '+55 11 99999-9995', status: 'disconnected', client: null, qrCode: null },
    instance6: { session: 'marketing', name: 'WhatsApp Marketing', phone: '+55 11 99999-9996', status: 'disconnected', client: null, qrCode: null },
    instance7: { session: 'sac', name: 'WhatsApp SAC', phone: '+55 11 99999-9997', status: 'disconnected', client: null, qrCode: null }
};

// Cache em memória para conversas (apenas para UI)
let conversationsCache = {};

// Iniciar todas as sessões automaticamente
async function startAllSessions() {
    for (const [key, config] of Object.entries(sessions)) {
        await startSession(key, config.session);
    }
}

async function startSession(instanceId, sessionName) {
    const config = sessions[instanceId];
    if (!config) return;
    
    try {
        config.status = 'connecting';
        
        const client = await wppconnect.create({
            session: sessionName,
            headless: true,
            qrcode: true,
            autoClose: false,
            folderNameToken: `tokens_${sessionName}`,
            catchQR: (base64Qrimg, qrCodeString) => {
                config.qrCode = base64Qrimg;
                console.log(`📱 QR Code gerado para ${config.name}`);
            },
            statusFind: (statusSession) => {
                if (statusSession === 'isLogged') {
                    config.status = 'connected';
                    config.client = client;
                    config.qrCode = null;
                    console.log(`✅ ${config.name} conectado!`);
                }
                if (statusSession === 'notLogged') {
                    config.status = 'disconnected';
                    config.client = null;
                }
            }
        });
        
        // Evento de nova mensagem
        client.onMessage(async (message) => {
            if (message.isGroupMsg) return;
            
            const phone = message.from.replace('@c.us', '');
            const text = message.body;
            const contactName = message.sender.pushname || message.sender.name || phone;
            
            console.log(`📨 [${config.name}] ${contactName}: ${text}`);
            
            // Atualizar cache para UI
            if (!conversationsCache[instanceId]) conversationsCache[instanceId] = {};
            if (!conversationsCache[instanceId][phone]) {
                conversationsCache[instanceId][phone] = {
                    phone: phone,
                    name: contactName,
                    messages: [],
                    lastMessage: text,
                    lastTime: new Date().toISOString()
                };
            }
            
            conversationsCache[instanceId][phone].messages.push({
                message: text,
                direction: 'inbound',
                timestamp: new Date().toISOString()
            });
            conversationsCache[instanceId][phone].lastMessage = text;
            conversationsCache[instanceId][phone].lastTime = new Date().toISOString();
        });
        
    } catch (error) {
        console.error(`❌ Erro ao iniciar ${config.name}:`, error.message);
        config.status = 'disconnected';
    }
}

// Iniciar todas as sessões
startAllSessions();

// ==================== Rotas da API ====================

// Listar conversas (busca direto do WhatsApp)
app.get('/api/conversations', async (req, res) => {
    const { instance = 'instance1' } = req.query;
    const config = sessions[instance];
    
    if (!config || config.status !== 'connected') {
        return res.json({ conversations: [] });
    }
    
    try {
        const client = config.client;
        const chats = await client.getAllChats();
        
        const conversations = chats
            .filter(chat => !chat.isGroup)
            .map(chat => ({
                phone: chat.id.user,
                name: chat.name || chat.formattedTitle,
                lastMessage: chat.lastMessage?.body || '',
                lastTime: chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp * 1000).toISOString() : new Date().toISOString()
            }));
        
        res.json({ conversations });
    } catch (error) {
        console.error('Erro ao buscar chats:', error);
        res.json({ conversations: [] });
    }
});

// Listar mensagens de uma conversa
app.get('/api/messages', async (req, res) => {
    const { instanceName = 'instance1', phone } = req.query;
    const config = sessions[instanceName];
    
    if (!phone) {
        return res.status(400).json({ error: 'Telefone não informado' });
    }
    
    if (!config || config.status !== 'connected') {
        return res.json({ messages: [] });
    }
    
    try {
        const client = config.client;
        const chatId = `${phone}@c.us`;
        const messages = await client.getAllMessagesInChat(chatId);
        
        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            message: msg.body,
            direction: msg.fromMe ? 'outbound' : 'inbound',
            timestamp: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
            status: msg.ack === 3 ? 'read' : 'sent'
        }));
        
        res.json({ messages: formattedMessages });
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.json({ messages: [] });
    }
});

// Enviar mensagem
app.post('/api/send', async (req, res) => {
    const { instanceName, phone, message } = req.body;
    const config = sessions[instanceName];
    
    if (!config || config.status !== 'connected') {
        return res.status(500).json({ error: 'WhatsApp não conectado' });
    }
    
    try {
        const client = config.client;
        const formattedPhone = `${phone}@c.us`;
        const result = await client.sendText(formattedPhone, message);
        
        console.log(`📤 [${config.name}] Mensagem enviada para ${phone}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao enviar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status de todas as instâncias
app.get('/api/wpp/status', (req, res) => {
    const statuses = {};
    const qrcodes = {};
    
    for (const [key, config] of Object.entries(sessions)) {
        statuses[key] = config.status;
        if (config.status === 'connecting' && config.qrCode) {
            qrcodes[key] = config.qrCode;
        }
    }
    
    res.json({ statuses, qrcodes });
});

// Iniciar sessão específica
app.post('/api/wpp/start/:instanceId', async (req, res) => {
    const { instanceId } = req.params;
    const config = sessions[instanceId];
    
    if (!config) {
        return res.status(404).json({ error: 'Instância não encontrada' });
    }
    
    await startSession(instanceId, config.session);
    res.json({ success: true, message: `Iniciando ${config.name}` });
});

// Desconectar sessão
app.post('/api/wpp/disconnect/:instanceId', async (req, res) => {
    const { instanceId } = req.params;
    const config = sessions[instanceId];
    
    if (config && config.client) {
        try {
            await config.client.close();
        } catch (e) {}
        config.client = null;
        config.status = 'disconnected';
        console.log(`❌ ${config.name} desconectado`);
    }
    
    res.json({ success: true });
});

// Interface do chat
app.get('/whatsapp-chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'whatsapp-chat.html'));
});

// Interface de gerenciamento
app.get('/manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manager.html'));
});

// Health check
app.get('/health', (req, res) => {
    const statuses = {};
    for (const [key, config] of Object.entries(sessions)) {
        statuses[key] = config.status;
    }
    
    res.json({
        status: 'online',
        connections: statuses,
        timestamp: new Date().toISOString()
    });
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`🚀 WhatsApp CRM - Sem Banco de Dados`);
    console.log(`========================================`);
    console.log(`📡 Porta: ${PORT}`);
    console.log(`📱 Chat: /whatsapp-chat`);
    console.log(`⚙️  Gerenciador: /manager`);
    console.log(`🔌 Status: /health`);
    console.log(`========================================\n`);
});