const express = require("express");
const router = express.Router();

const bitrix = require("../services/bitrix");
const routerSvc = require("../services/router");
const dedup = require("../services/dedup");
const evolution = require("../services/evolution");

router.post("/evolution", async (req, res) => {
  try {
    const data = req.body;

    const msg = data.data;
    const instanceId = data.instance;

    if (!msg) return res.sendStatus(200);

    const text = msg.message?.conversation;
    const jid = msg.key?.remoteJid;
    const msgId = msg.key?.id;

    if (!text || !msgId || !jid) return res.sendStatus(200);

    if (dedup.isDuplicate(msgId)) return res.sendStatus(200);

    const instance = routerSvc.getInstance(instanceId);

    if (!instance) return res.sendStatus(200);

    await bitrix.sendToBitrix({
      phone: jid,
      message: text,
      userId: instance.bitrixUserId
    });

    console.log("✅ ENVIADO PRO BITRIX:", text);

    res.sendStatus(200);
  } catch (err) {
    console.log("❌ ERROR:", err);
    res.sendStatus(500);
  }
});

module.exports = router;