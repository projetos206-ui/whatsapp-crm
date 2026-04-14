const express = require("express");
const router = express.Router();

const bitrix = require("../services/bitrix");

router.post("/evolution", async (req, res) => {
  try {
    const data = req.body;

    const msg = data.data;
    const instanceId = data.instance;

    if (!msg) return res.sendStatus(200);

    const text = msg.message?.conversation;
    const phone = msg.key?.remoteJid;
    const fromMe = msg.key?.fromMe;

    // 🚨 IGNORA MENSAGENS PRÓPRIAS
    if (fromMe) return res.sendStatus(200);

    if (!text || !phone) return res.sendStatus(200);

    console.log("📩 RECEBIDO:", text);

    // 🚀 AQUI ESTAVA FALTANDO NO SEU SISTEMA
    await bitrix.sendToBitrix({
      phone,
      message: text,
      userId: 1 // ou fixo para teste
    });

    console.log("🚀 ENVIADO PRO BITRIX");

    res.sendStatus(200);

  } catch (err) {
    console.log("❌ WEBHOOK ERROR:", err);
    res.sendStatus(500);
  }
});

module.exports = router;