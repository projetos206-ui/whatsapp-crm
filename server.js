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
      logger.info(`📞 Chamando Bitrix24: ${method}`);
      
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

  async findOrCreateLead(phone, contactName, message) {
    try {
      const formattedPhone = phone.replace(/[^0-9]/g, '');
      
      // Buscar lead existente pelo telefone
      const existingLeads = await this.callMethod('crm.lead.list', {
        filter: { PHONE: formattedPhone },
        order: { DATE_CREATE: 'DESC' },
        select: ['ID', 'TITLE', 'STATUS_ID'],
        limit: 1
      });
      
      if (existingLeads && existingLeads.length > 0) {
        const leadId = existingLeads[0].ID;
        logger.info(`✅ Lead existente encontrado: ${leadId}`);
        
        // Adicionar comentário no lead existente
        await this.callMethod('crm.timeline.comment.add', {
          fields: {
            ENTITY_ID: leadId,
            ENTITY_TYPE: 'lead',
            COMMENT: `📱 *Nova mensagem WhatsApp*\n👤 ${contactName || phone}\n💬 ${message}\n🕐 ${new Date().toLocaleString('pt-BR')}`
          }
        });
        
        return leadId;
      }
      
      // Criar novo lead
      logger.info(`🆕 Criando novo lead para: ${contactName || phone}`);
      const leadData = {
        TITLE: `WhatsApp: ${contactName || formattedPhone}`,
        NAME: contactName || `Cliente ${formattedPhone}`,
        PHONE: [{ VALUE: formattedPhone, VALUE_TYPE: 'WORK' }],
        SOURCE_ID: 'WEB',
        SOURCE_DESCRIPTION: `WhatsApp - ${new Date().toLocaleString('pt-BR')}`,
        COMMENTS: `Primeira mensagem: ${message.substring(0, 500)}`,
        STATUS_ID: 'NEW'
      };
      
      const newLead = await this.callMethod('crm.lead.add', {
        fields: leadData,
        params: { REGISTER_SONET_EVENT: 'Y' }
      });
      
      logger.info(`✅ Lead criado: ${newLead}`);
      return newLead;
      
    } catch (error) {
      logger.error(`Erro ao processar lead: ${error.message}`);
      throw error;
    }
  }

  async addMessageToLead(leadId, contactName, message, direction = 'incoming') {
    try {
      const directionText = direction === 'incoming' ? '📥 Recebida' : '📤 Enviada';
      const comment = `
━━━━━━━━━━━━━━━━━━━
${directionText}
👤 ${contactName}
💬 ${message}
🕐 ${new Date().toLocaleString('pt-BR')}
━━━━━━━━━━━━━━━━━━━
      `;
      
      await this.callMethod('crm.timeline.comment.add', {
        fields: {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: comment
        }
      });
      
      logger.info(`✅ Mensagem adicionada ao lead ${leadId}`);
      return true;
      
    } catch (error) {
      logger.error(`Erro ao adicionar mensagem: ${error.message}`);
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
        logger.error(`❌ Não foi possível extrair telefone`);
        return;
      }
      
      logger.info(`========================================`);
      logger.info(`📨 Nova mensagem de: ${phone}`);
      logger.info(`👤 Nome: ${contactName || 'Não informado'}`);
      logger.info(`💬 Mensagem: ${message}`);
      logger.info(`📡 Instância: ${instanceName}`);
      
      // Verificar lead existente ou criar novo
      let lead = this.leadManager.get(phone);
      let leadId = null;
      
      if (lead) {
        leadId = lead.leadId;
        logger.info(`📝 Lead encontrado na cache: ${leadId}`);
        await this.bitrixService.addMessageToLead(leadId, contactName || phone, message, 'incoming');
      } else {
        logger.info(`🆕 Criando novo lead no CRM...`);
        leadId = await this.bitrixService.findOrCreateLead(phone, contactName, message);
        this.leadManager.set(phone, leadId);
      }
      
      logger.info(`✅✅✅ MENSAGEM ENVIADA AO CRM! ✅✅✅`);
      logger.info(`📊 Lead ID: ${leadId}`);
      logger.info(`========================================\n`);
      
    } catch (error) {
      logger.error(`❌ ERRO: ${error.message}`);
    }
  }
}

// ==================== Express App ====================
const app = express();
const leadManager = new LeadManager();
const bitrixService = new BitrixCRMService(process.env.BITRIX_WEBHOOK);
const webhookHandler = new EvolutionWebhookHandler(bitrixService, leadManager);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== Routes ====================

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
  console.log(`✅ Status: ATIVO`);
  console.log('========================================\n');
  
  logger.info(`✅ Bitrix24 Webhook: ${process.env.BITRIX_WEBHOOK ? 'Configurado' : 'FALTANDO!'}`);
});