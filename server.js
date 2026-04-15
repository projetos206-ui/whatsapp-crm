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

// ==================== Aumentar limite ====================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== Cache ====================
class LeadManager {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 86400 });
  }

  getKey(identifier) {
    return identifier.toString();
  }

  set(identifier, leadId, name) {
    const key = this.getKey(identifier);
    this.cache.set(key, {
      leadId: leadId,
      identifier: identifier,
      name: name,
      createdAt: new Date().toISOString(),
      lastMessage: new Date().toISOString()
    });
    logger.info(`✅ Lead salvo: ${identifier} -> ID: ${leadId}`);
    return this.cache.get(key);
  }

  get(identifier) {
    const key = this.getKey(identifier);
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

  async findLeadByIdentifier(identifier) {
    try {
      // Buscar pelo telefone (se for número normal)
      if (identifier.toString().length < 20) {
        const result = await this.callMethod('crm.lead.list', {
          filter: { PHONE: identifier.toString() },
          order: { DATE_CREATE: 'DESC' },
          select: ['ID', 'TITLE'],
          limit: 1
        });
        
        return result && result.length > 0 ? result[0].ID : null;
      }
      
      // Buscar pelo título (se for grupo)
      const result = await this.callMethod('crm.lead.list', {
        filter: { TITLE: `%${identifier}%` },
        order: { DATE_CREATE: 'DESC' },
        select: ['ID', 'TITLE'],
        limit: 1
      });
      
      return result && result.length > 0 ? result[0].ID : null;
    } catch (error) {
      return null;
    }
  }

  async createLead(identifier, name, message, isGroup = false) {
    try {
      const leadType = isGroup ? 'Grupo WhatsApp' : 'WhatsApp';
      const title = isGroup ? `${leadType}: ${name}` : `${leadType}: ${name}`;
      
      const leadData = {
        TITLE: title,
        NAME: name,
        SOURCE_ID: 'WEB',
        SOURCE_DESCRIPTION: `${leadType} - ${new Date().toLocaleString('pt-BR')}`,
        COMMENTS: message.substring(0, 500),
        STATUS_ID: 'NEW'
      };
      
      // Se for contato individual (não grupo), adicionar telefone
      if (!isGroup && identifier.toString().length < 20) {
        leadData.PHONE = [{ VALUE: identifier.toString(), VALUE_TYPE: 'WORK' }];
      }
      
      const newLead = await this.callMethod('crm.lead.add', {
        fields: leadData,
        params: { REGISTER_SONET_EVENT: 'Y' }
      });
      
      logger.info(`✅ Lead criado: ${newLead} - ${name} ${isGroup ? '(Grupo)' : '(Individual)'}`);
      return newLead;
    } catch (error) {
      logger.error(`Erro ao criar lead: ${error.message}`);
      throw error;
    }
  }

  async addCommentToLead(leadId, name, message) {
    try {
      const comment = `💬 ${message}`;
      
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
      let identifier = null;
      let contactName = null;
      let isGroup = false;
      
      // Extrair identificador (telefone ou grupo)
      if (messageData.key?.remoteJid) {
        identifier = messageData.key.remoteJid;
        isGroup = this.isGroupMessage(identifier);
        
        // Limpar o identificador
        if (isGroup) {
          identifier = identifier.replace('@g.us', '');
          contactName = messageData.pushName || `Grupo ${identifier}`;
        } else {
          identifier = identifier.split('@')[0];
          contactName = messageData.pushName || messageData.notifyName || `Contato ${identifier}`;
        }
      } else if (messageData.from) {
        identifier = messageData.from.split('@')[0];
        contactName = messageData.pushName || `Contato ${identifier}`;
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
      
      if (!identifier) {
        logger.warn(`⚠️ Não foi possível extrair identificador`);
        return;
      }
      
      logger.info(`========================================`);
      logger.info(`📨 Nova ${isGroup ? 'mensagem de GRUPO' : 'mensagem'}`);
      logger.info(`🆔 Identificador: ${identifier}`);
      logger.info(`👤 Nome: ${contactName}`);
      logger.info(`💬 Mensagem: ${message}`);
      logger.info(`📡 Instância: ${instanceName}`);
      
      // Verificar lead existente
      let leadId = this.leadManager.get(identifier);
      
      if (!leadId) {
        leadId = await this.bitrixService.findLeadByIdentifier(identifier);
        if (leadId) {
          this.leadManager.set(identifier, leadId, contactName);
        }
      }
      
      if (leadId) {
        // Lead existe - adicionar comentário
        await this.bitrixService.addCommentToLead(leadId, contactName, message);
        logger.info(`✅ Mensagem adicionada ao lead existente: ${leadId}`);
      } else {
        // Criar novo lead
        leadId = await this.bitrixService.createLead(identifier, contactName, message, isGroup);
        this.leadManager.set(identifier, leadId, contactName);
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
    mode: 'Enviando para Leads do Bitrix24 (com suporte a grupos)',
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
  console.log(`👥 Suporte: Grupos e Individuais`);
  console.log(`✅ Status: FUNCIONANDO`);
  console.log('========================================\n');
});