router.post("/evolution", async (req, res) => {
  try {
    const data = req.body;

    const event = data.event;
    const instanceId = data.instance;
    const msg = data.data;

    if (!msg) return res.sendStatus(200);

    // 🚨 1. só mensagens reais
    if (event !== "messages.upsert") return res.sendStatus(200);

    // 🚨 2. ignora mensagens do próprio bot
    if (msg.key?.fromMe) return res.sendStatus(200);

    // 🚨 3. ignora grupos (OPCIONAL, mas recomendado)
    const jid = msg.key?.remoteJid;
    if (jid?.includes("@g.us")) return res.sendStatus(200);

    // 🚨 4. pegar texto correto
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text;

    if (!text) return res.sendStatus(200);

    const msgId = msg.key?.id;
    if (!msgId) return res.sendStatus(200);

    // 🚨 5. anti duplicação (se você já tiver)
    const dedup = require("../services/dedup");
    if (dedup.isDuplicate(msgId)) return res.sendStatus(200);

    // 🚨 6. router (instância → atendente)
    const routerSvc = require("../services/router");
    const instance = routerSvc.getInstance(instanceId);

    if (!instance) return res.sendStatus(200);

    // 🚨 7. ENVIAR PRO BITRIX (AQUI ESTAVA FALTANDO OU NÃO EXECUTANDO)
    const bitrix = require("../services/bitrix");

    await bitrix.sendToBitrix({
      phone: jid,
      message: text,
      userId: instance.bitrixUserId
    });

    console.log("✅ Enviado para Bitrix:", text);

    res.sendStatus(200);
  } catch (err) {
    console.log("❌ erro webhook:", err);
    res.sendStatus(500);
  }
});