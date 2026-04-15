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

// ==================== Aumentar limite do payload ====================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== Cache ====================
class LeadManager {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 86400 });
  }

  getKey(phone) {
    return phone.replace(/[^0-9]/g, '');
  }

  set(phone, leadId) {
    const key = this.getKey(phone);
    this.cache.set(key, {
      leadId: leadId,
      phone: phone,
      createdAt: new Date().toISOString(),
      lastMessage: new Date().toISOString()
    });
    logger.info(`✅ Lead salvo: ${phone} -> ID: ${leadId}`);
    return this.cache.get(key);
  }

  get(phone) {
    const key = this.getKey(phone);
    return this.cache.get(key);
  }
}

// ==================== Bitrix24 CRM Service ====================
class BitrixCRMService {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
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
      logger.error(`❌ Bitrix24 falhou: ${method} - ${error.message}`);
      throw error;
    }
  }

  async findLeadByPhone(phone) {
    try {
      const formattedPhone = phone.replace(/[^0-9]/g, '');
      
      const result = await this.callMethod('crm.lead.list', {
        filter: { PHONE: formattedPhone },
        order: { DATE_CREATE: 'DESC' },
        select: ['ID', 'TITLE', 'STATUS_ID'],
        limit: 1
      });
      
      return result && result.length > 0 ? result[0].ID : null;
    } catch (error) {
      logger.warn(`Erro ao buscar lead: ${error.message}`);
      return null;
    }
  }

  async createLead(phone, contactName, message) {
    try {
      const formattedPhone = phone.replace(/[^0-9]/g, '');
      const name = contactName || `Cliente ${formattedPhone}`;
      
      const leadData = {
        TITLE: `WhatsApp: ${name}`,
        NAME: name,
        PHONE: [{ VALUE: formattedPhone, VALUE_TYPE: 'WORK' }],
        SOURCE_ID: 'WEB',
        SOURCE_DESCRIPTION: `WhatsApp - ${new Date().toLocaleString('pt-BR')}`,
        COMMENTS: message.substring(0, 500),
        STATUS_ID: 'NEW'
      };
      
      const newLead = await this.callMethod('crm.lead.add', {
        fields: leadData,
        params: { REGISTER_SONET_EVENT: 'Y' }
      });
      
      logger.info(`✅ Lead criado: ${newLead} - ${name}`);
      return newLead;
    } catch (error) {
      logger.error(`Erro ao criar lead: ${error.message}`);
      throw error;
    }
  }

  async addCommentToLead(leadId, contactName, message) {
    try {
      const comment = `📱 ${message}`;
      
      await this.callMethod('crm.timeline.comment.add', {
        fields: {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: comment
        }
      });
      
      logger.info(`✅ Comentário adicionado ao lead ${leadId}`);
      return true;
    } catch (error) {
      logger.error(`Erro ao adicionar comentário: ${error.message}`);
      return false;
    }
  }
}

// ==================== Evolution API Handler ====================
class EvolutionWebhookHandler {
  constructor(bitrixService, leadManager) {
    this.bitrixService = bitrixService;
    this.leadManager = leadManager;
  }

  extractMessageContent(messageData) {
    // Tentar diferentes formatos de mensagem
    if (messageData.conversation) {
      return messageData.conversation;
    }
    if (messageData.extendedTextMessage?.text) {
      return messageData.extendedTextMessage.text;
    }
    if (messageData.imageMessage?.caption) {
      return `📷 Imagem: ${messageData.imageMessage.caption}`;
    }
    if (messageData.videoMessage?.caption) {
      return `🎥 Vídeo: ${messageData.videoMessage.caption}`;
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
      
      // Extrair telefone
      if (messageData.key?.remoteJid) {
        phone = messageData.key.remoteJid.split('@')[0];
      } else if (messageData.from) {
        phone = messageData.from.split('@')[0];
      }
      
      // Extrair nome
      contactName = messageData.pushName || messageData.notifyName || null;
      
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
      
      // Limitar tamanho da mensagem
      if (message.length > 500) {
        message = message.substring(0, 500) + "...";
      }
      
      if (!phone || phone.length < 10) {
        logger.warn(`⚠️ Telefone inválido: ${phone}`);
        return;
      }
      
      logger.info(`========================================`);
      logger.info(`📨 Nova mensagem de: ${phone}`);
      logger.info(`👤 Nome: ${contactName || 'Não informado'}`);
      logger.info(`💬 Mensagem: ${message}`);
      
      // Verificar lead existente
      let leadId = this.leadManager.get(phone);
      
      if (!leadId) {
        leadId = await this.bitrixService.findLeadByPhone(phone);
        if (leadId) {
          this.leadManager.set(phone, leadId);
        }
      }
      
      if (leadId) {
        // Lead existe - adicionar comentário
        await this.bitrixService.addCommentToLead(leadId, contactName || phone, message);
        logger.info(`✅ Mensagem adicionada ao lead existente: ${leadId}`);
      } else {
        // Criar novo lead
        leadId = await this.bitrixService.createLead(phone, contactName, message);
        this.leadManager.set(phone, leadId);
        logger.info(`✅ Novo lead criado: ${leadId}`);
      }
      
      logger.info(`✅✅✅ MENSAGEM ENVIADA AO CRM! ✅✅✅`);
      logger.info(`========================================\n`);
      
    } catch (error) {
      logger.error(`❌ ERRO: ${error.message}`);
    }
  }
}

// ==================== Routes ====================
const leadManager = new LeadManager();
const bitrixService = new BitrixCRMService(process.env.BITRIX_WEBHOOK);
const webhookHandler = new EvolutionWebhookHandler(bitrixService, leadManager);

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp CRM Integration',
    mode: 'Enviando para Leads do Bitrix24',
    endpoints: {
      health: 'GET /health',
      webhook: 'POST /webhook/evolution/:instanceName',
      leads: 'GET /api/leads'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    leads: leadManager.cache.keys().length,
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
      message: 'Mensagem enviada ao CRM',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Erro: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Ver leads criados
app.get('/api/leads', (req, res) => {
  const leads = leadManager.cache.keys().reduce((acc, key) => {
    acc[key] = leadManager.cache.get(key);
    return acc;
  }, {});
  
  res.json({
    total: Object.keys(leads).length,
    leads: leads
  });
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('🚀 WhatsApp → Bitrix24 CRM');
  console.log('========================================');
  console.log(`📡 Servidor: https://whatsapp-crm-ewix.onrender.com`);
  console.log(`📨 Webhook: POST /webhook/evolution/:instanceName`);
  console.log(`💼 Modo: Enviando para LEADS do CRM`);
  console.log(`✅ Status: FUNCIONANDO`);
  console.log('========================================\n');
});