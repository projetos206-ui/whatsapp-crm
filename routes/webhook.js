const express = require("express");
const router = express.Router();

const bitrix = require("../services/bitrix");
const routerSvc = require("../services/router");
const dedup = require("../services/dedup");
const evolution = require("../services/evolution");

router.post("/evolution", async (req, res) => {
  try {
    const data = req.body;

    const msgId = data.data?.key?.id;
    const instanceId = data.instance;
    const jid = data.data?.key?.remoteJid;
    const text = data.data?.message?.conversation;

    if (!msgId || !instanceId || !jid || !text) {
      return res.sendStatus(200);
    }

    // 🔥 anti duplicação
    if (dedup.isDuplicate(msgId)) {
      return res.sendStatus(200);
    }

    // 🔥 identificar atendente
    const instance = routerSvc.getInstance(instanceId);
    if (!instance) return res.sendStatus(200);

    // 🔥 enviar para Bitrix
    await bitrix.sendToBitrix({
      phone: jid,
      message: text,
      userId: instance.bitrixUserId
    });

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});


// 📤 Bitrix → WhatsApp
router.post("/send", async (req, res) => {
  const { instance, phone, message } = req.body;

  await evolution.sendMessage(instance, phone, message);

  res.json({ ok: true });
});

module.exports = router;