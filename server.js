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
const { Pool } = require('pg');

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ==================== Configuração do Banco de Dados ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Criar tabelas se não existirem
async function initDatabase() {
    try {
        // Tabela de conversas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(50) NOT NULL,
                contact_name VARCHAR(255),
                instance_name VARCHAR(50) NOT NULL,
                last_message TEXT,
                last_time TIMESTAMP,
                unread_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(instance_name, phone)
            )
        `);
        
        // Tabela de mensagens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(50) NOT NULL,
                instance_name VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                direction VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'received',
                timestamp TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Índices para busca rápida
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_name)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_instance ON conversations(instance_name)`);
        
        console.log('✅ Banco de dados inicializado');
    } catch (error) {
        console.error('Erro ao inicializar banco:', error.message);
    }
}

initDatabase();

// ==================== Configuração das Instâncias ====================
const instances = {
    instance1: {
        id: process.env.INSTANCE_1_ID || '464c3279-6c01-4a14-a69b-0a186a4b33c6',
        apiKey: process.env.INSTANCE_1_API_KEY,
        name: 'WhatsApp Vendas',
        phone: '+55 88 981118927'
    },
    instance2: { id: process.env.INSTANCE_2_ID, apiKey: process.env.INSTANCE_2_API_KEY, name: 'WhatsApp Suporte', phone: '+55 11 99999-9992' },
    instance3: { id: process.env.INSTANCE_3_ID, apiKey: process.env.INSTANCE_3_API_KEY, name: 'WhatsApp Financeiro', phone: '+55 11 99999-9993' },
    instance4: { id: process.env.INSTANCE_4_ID, apiKey: process.env.INSTANCE_4_API_KEY, name: 'WhatsApp Atendimento', phone: '+55 11 99999-9994' },
    instance5: { id: process.env.INSTANCE_5_ID, apiKey: process.env.INSTANCE_5_API_KEY, name: 'WhatsApp Comercial', phone: '+55 11 99999-9995' },
    instance6: { id: process.env.INSTANCE_6_ID, apiKey: process.env.INSTANCE_6_API_KEY, name: 'WhatsApp Marketing', phone: '+55 11 99999-9996' },
    instance7: { id: process.env.INSTANCE_7_ID, apiKey: process.env.INSTANCE_7_API_KEY, name: 'WhatsApp SAC', phone: '+55 11 99999-9997' }
};

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://129.121.54.24:8080';

// ==================== Funções do Banco de Dados ====================

// Salvar mensagem no banco
async function saveMessageToDB(instanceName, phone, message, direction, contactName = null) {
    try {
        // Salvar mensagem
        await pool.query(
            `INSERT INTO messages (phone, instance_name, message, direction, timestamp) 
             VALUES ($1, $2, $3, $4, $5)`,
            [phone, instanceName, message, direction, new Date().toISOString()]
        );
        
        // Atualizar ou criar conversa
        const existing = await pool.query(
            `SELECT * FROM conversations WHERE instance_name = $1 AND phone = $2`,
            [instanceName, phone]
        );
        
        if (existing.rows.length > 0) {
            await pool.query(
                `UPDATE conversations 
                 SET last_message = $1, last_time = $2, 
                     unread_count = unread_count + $3,
                     contact_name = COALESCE($4, contact_name),
                     updated_at = NOW()
                 WHERE instance_name = $5 AND phone = $6`,
                [message, new Date().toISOString(), direction === 'inbound' ? 1 : 0, contactName, instanceName, phone]
            );
        } else {
            await pool.query(
                `INSERT INTO conversations (phone, contact_name, instance_name, last_message, last_time, unread_count)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [phone, contactName || phone, instanceName, message, new Date().toISOString(), direction === 'inbound' ? 1 : 0]
            );
        }
        
        console.log(`💾 [${instanceName}] Mensagem salva no banco: ${phone}`);
        return true;
    } catch (error) {
        console.error('Erro ao salvar no banco:', error.message);
        return false;
    }
}

// Buscar conversas do banco
async function getConversationsFromDB(instanceName = null) {
    try {
        let query = `SELECT * FROM conversations`;
        let params = [];
        
        if (instanceName) {
            query += ` WHERE instance_name = $1`;
            params.push(instanceName);
        }
        
        query += ` ORDER BY last_time DESC`;
        
        const result = await pool.query(query, params);
        return result.rows.map(row => ({
            phone: row.phone,
            name: row.contact_name || row.phone,
            lastMessage: row.last_message,
            lastTime: row.last_time,
            unreadCount: row.unread_count,
            instanceName: row.instance_name
        }));
    } catch (error) {
        console.error('Erro ao buscar conversas:', error.message);
        return [];
    }
}

// Buscar mensagens de uma conversa
async function getMessagesFromDB(instanceName, phone) {
    try {
        const result = await pool.query(
            `SELECT * FROM messages 
             WHERE instance_name = $1 AND phone = $2 
             ORDER BY timestamp ASC`,
            [instanceName, phone]
        );
        
        return result.rows.map(row => ({
            id: row.id,
            message: row.message,
            direction: row.direction,
            timestamp: row.timestamp,
            status: row.status
        }));
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error.message);
        return [];
    }
}

// Marcar conversa como lida
async function markAsReadInDB(instanceName, phone) {
    try {
        await pool.query(
            `UPDATE conversations SET unread_count = 0 WHERE instance_name = $1 AND phone = $2`,
            [instanceName, phone]
        );
        return true;
    } catch (error) {
        console.error('Erro ao marcar como lida:', error.message);
        return false;
    }
}

// ==================== Webhook ====================
app.post('/webhook/evolution/:instanceName', async (req, res) => {
    const { instanceName } = req.params;
    const webhookData = req.body;
    
    console.log(`📨 Webhook recebido para: ${instanceName}`);
    
    try {
        const messageData = webhookData.data || webhookData;
        let phone = null;
        let message = null;
        let contactName = null;
        
        // Extrair telefone (ignorar grupos)
        if (messageData.key?.remoteJid) {
            const remoteJid = messageData.key.remoteJid;
            if (remoteJid.includes('@g.us')) {
                return res.status(200).json({ status: 'ignored', reason: 'group' });
            }
            phone = remoteJid.split('@')[0];
            contactName = messageData.pushName || messageData.notifyName || phone;
        } else if (messageData.sender) {
            phone = messageData.sender.split('@')[0];
            contactName = messageData.pushName || phone;
        }
        
        // Extrair mensagem
        if (messageData.message?.conversation) {
            message = messageData.message.conversation;
        } else if (messageData.message?.extendedTextMessage?.text) {
            message = messageData.message.extendedTextMessage.text;
        } else if (messageData.body) {
            message = messageData.body;
        } else {
            message = "📱 Mensagem recebida";
        }
        
        if (phone && message) {
            await saveMessageToDB(instanceName, phone, message, 'inbound', contactName);
            console.log(`✅ Mensagem de ${contactName} (${phone}) salva no banco`);
        }
        
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).json({ status: 'error' });
    }
});

// ==================== Rotas da API ====================

// Listar conversas
app.get('/api/conversations', async (req, res) => {
    const { instance = 'instance1' } = req.query;
    const conversations = await getConversationsFromDB(instance);
    res.json({ conversations });
});

// Listar mensagens
app.get('/api/messages', async (req, res) => {
    const { instanceName = 'instance1', phone } = req.query;
    
    if (!phone) {
        return res.status(400).json({ error: 'Telefone não informado' });
    }
    
    const messages = await getMessagesFromDB(instanceName, phone);
    res.json({ messages });
});

// Enviar mensagem
app.post('/api/send', async (req, res) => {
    const { instanceName, phone, message } = req.body;
    
    if (!instanceName || !phone || !message) {
        return res.status(400).json({ error: 'instanceName, phone e message são obrigatórios' });
    }
    
    const instance = instances[instanceName];
    if (!instance?.id || !instance?.apiKey) {
        return res.status(400).json({ error: `Instância ${instanceName} não configurada` });
    }
    
    try {
        await axios.post(
            `${EVOLUTION_URL}/message/sendText/${instance.id}`,
            { number: phone, text: message },
            { headers: { 'apikey': instance.apiKey, 'Content-Type': 'application/json' } }
        );
        
        await saveMessageToDB(instanceName, phone, message, 'outbound');
        
        console.log(`📤 Mensagem enviada para ${phone}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao enviar:', error.message);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

// Marcar como lida
app.post('/api/mark-read', async (req, res) => {
    const { instanceName, phone } = req.body;
    await markAsReadInDB(instanceName, phone);
    res.json({ success: true });
});

// Interface
app.get('/whatsapp-chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'whatsapp-chat.html'));
});

app.get('/health', async (req, res) => {
    const conversations = await getConversationsFromDB();
    res.json({
        status: 'online',
        conversations: conversations.length,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`🚀 WhatsApp CRM - Com Banco de Dados`);
    console.log(`========================================`);
    console.log(`📡 Porta: ${PORT}`);
    console.log(`📱 Interface: /whatsapp-chat`);
    console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
    console.log(`💾 Banco: PostgreSQL`);
    console.log(`========================================\n`);
});