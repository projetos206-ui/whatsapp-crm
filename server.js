const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
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
    winston.format.json()
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

  set(instance, phone, chatId) {
    const key = `${instance}:${phone}`;
    this.cache.set(key, { chatId, instance, phone, createdAt: new Date().toISOString() });
    logger.info(`Chat session saved - ${instance}:${phone} -> ${chatId}`);
    return { chatId, instance, phone };
  }

  get(instance, phone) {
    return this.cache.get(`${instance}:${phone}`);
  }
}

// ==================== Evolution Manager Controller ====================
class EvolutionManagerController {
  constructor(instanceId, apiKey, managerUrl) {
    this.instanceId = instanceId;
    this.apiKey = apiKey;
    this.managerUrl = managerUrl;
    this.browser = null;
    this.page = null;
    this.messageHandler = null;
  }

  async initialize() {
    logger.info(`Initializing Evolution Manager for instance ${this.instanceId}`);
    
    puppeteer.use(StealthPlugin());
    
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Navigate to dashboard
    await this.page.goto(`${this.managerUrl}/manager/instance/${this.instanceId}/dashboard`, {
      waitUntil: 'networkidle2'
    });
    
    logger.info(`Navigation completed for instance ${this.instanceId}`);
    
    // Start monitoring messages
    await this.startMessageMonitoring();
    
    return true;
  }

  async startMessageMonitoring() {
    // Monitor DOM for new messages
    await this.page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            // Check for new message elements
            const messages = document.querySelectorAll('.message-item:not([data-processed])');
            messages.forEach(msg => {
              msg.setAttribute('data-processed', 'true');
              const text = msg.querySelector('.message-text')?.innerText;
              const sender = msg.querySelector('.message-sender')?.innerText;
              
              if (text && sender) {
                window.dispatchEvent(new CustomEvent('newMessage', {
                  detail: { text, sender, timestamp: new Date().toISOString() }
                }));
              }
            });
          }
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    });
    
    // Listen for new messages
    await this.page.exposeFunction('onNewMessage', async (messageData) => {
      logger.info(`New message detected: ${JSON.stringify(messageData)}`);
      if (this.messageHandler) {
        await this.messageHandler(messageData);
      }
    });
    
    await this.page.evaluate(() => {
      window.addEventListener('newMessage', (event) => {
        window.onNewMessage(event.detail);
      });
    });
  }

  async sendMessage(phone, message) {
    try {
      // Method 1: Try to use the UI to send message
      await this.page.click('.new-message-button');
      await this.page.waitForSelector('.phone-input');
      await this.page.type('.phone-input', phone);
      await this.page.type('.message-input', message);
      await this.page.click('.send-button');
      
      logger.info(`Message sent to ${phone}: ${message.substring(0, 50)}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to send message via UI: ${error.message}`);
      
      // Method 2: Try direct API call
      try {
        const response = await axios.post(
          `${this.managerUrl}/manager/api/instance/${this.instanceId}/send`,
          { to: phone, message: message },
          { headers: { 'Content-Type': 'application/json' } }
        );
        return response.data;
      } catch (apiError) {
        logger.error(`Failed to send message via API: ${apiError.message}`);
        throw new Error('Cannot send message');
      }
    }
  }

  async disconnect() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  onMessage(handler) {
    this.messageHandler = handler;
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
      const response = await axios.post(`${this.webhookUrl}${method}`, params, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      if (response.data.error) {
        throw new Error(`Bitrix24 API Error: ${JSON.stringify(response.data.error)}`);
      }
      
      return response.data.result;
    } catch (error) {
      logger.error(`Bitrix24 API call failed: ${method}`, { error: error.message });
      throw error;
    }
  }

  async createChatSession(phone, instanceName) {
    const params = {
      LINE_ID: this.lineId,
      USER_CODE: `${instanceName}_${phone}`,
      USER_NAME: `WhatsApp ${phone}`,
      USER_FIRST_NAME: `WhatsApp`,
      USER_LAST_NAME: phone,
      USER_WORK_POSITION: `WhatsApp Instance: ${instanceName}`
    };
    
    const result = await this.callMethod('imopenlines.session.start', params);
    logger.info(`Chat session created: ${result.CHAT_ID} for ${phone}`);
    return result.CHAT_ID;
  }

  async sendMessage(chatId, message) {
    const params = {
      CHAT_ID: chatId,
      MESSAGE: message,
      SYSTEM: 'N'
    };
    
    return await this.callMethod('imopenlines.message.add', params);
  }
}

// ==================== Main App ====================
const app = express();
const sessionManager = new ChatSessionManager();
const bitrixService = new Bitrix24Service(
  process.env.BITRIX_WEBHOOK,
  process.env.BITRIX_LINE_ID
);

// Initialize Evolution Manager controllers
const evolutionControllers = {};

async function initEvolutionControllers() {
  const instances = [
    { 
      id: '464c3279-6c01-4a14-a69b-0a186a4b33c6', 
      name: 'instance1', 
      apiKey: process.env.INSTANCE_1_API_KEY,
      url: process.env.EVOLUTION_URL || 'http://129.121.54.24:8080'
    }
    // Add more instances here
  ];

  for (const instance of instances) {
    try {
      const controller = new EvolutionManagerController(
        instance.id,
        instance.apiKey,
        instance.url
      );
      
      controller.onMessage(async (messageData) => {
        await processIncomingMessage(instance.name, messageData, controller);
      });
      
      await controller.initialize();
      evolutionControllers[instance.name] = controller;
      logger.info(`✅ Evolution Manager initialized: ${instance.name}`);
    } catch (error) {
      logger.error(`Failed to initialize Evolution Manager: ${instance.name}`, { error: error.message });
    }
  }
}

async function processIncomingMessage(instanceName, messageData, controller) {
  try {
    const phone = messageData.sender || messageData.phone;
    const message = messageData.text || messageData.message;
    
    if (!phone || !message) {
      logger.warn('Invalid message data', { messageData });
      return;
    }
    
    logger.info(`Processing message from ${phone} via ${instanceName}: ${message.substring(0, 50)}`);
    
    // Get or create chat session
    let session = sessionManager.get(instanceName, phone);
    
    if (!session) {
      const chatId = await bitrixService.createChatSession(phone, instanceName);
      session = sessionManager.set(instanceName, phone, chatId);
    }
    
    // Send to Bitrix24
    await bitrixService.sendMessage(session.chatId, message);
    logger.info(`Message forwarded to Bitrix24 chat ${session.chatId}`);
    
  } catch (error) {
    logger.error(`Error processing message: ${error.message}`);
  }
}

// API endpoint to send message from Bitrix24 to WhatsApp
app.use(express.json());

app.post('/api/send-to-whatsapp', async (req, res) => {
  const { instanceName, phone, message } = req.body;
  
  try {
    if (!instanceName || !phone || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const controller = evolutionControllers[instanceName];
    if (!controller) {
      return res.status(404).json({ error: `Instance ${instanceName} not found` });
    }
    
    const result = await controller.sendMessage(phone, message);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error sending message', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    instances: Object.keys(evolutionControllers).length,
    activeSessions: sessionManager.cache.keys().length
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  await initEvolutionControllers();
  
  app.listen(PORT, () => {
    logger.info(`WhatsApp-Bitrix24 Integration Server started on port ${PORT}`);
    logger.info(`Active instances: ${Object.keys(evolutionControllers).length}`);
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing...');
  for (const controller of Object.values(evolutionControllers)) {
    await controller.disconnect();
  }
  process.exit(0);
});