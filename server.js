require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const BITRIX = process.env.BITRIX_WEBHOOK;
const LINE_ID = process.env.BITRIX_LINE_ID;

// 🔥 memória (depois pode virar banco)
const chats = {};

// 🔥 mapeia instâncias
const instanceMap = {
  instancia1: process.env.INSTANCE_1,
  instancia2: process.env.INSTANCE_2,
  instancia3: process.env.INSTANCE_3,
  instancia4: process.env.INSTANCE_4,
  instancia5: process.env.INSTANCE_5,
  instancia6: process.env.INSTANCE_6,
  instancia7: process.env.INSTANCE_7
};

// 🔥 webhook Evolution
app.post("/webhook/evolution", async (req, res) => {
  try {
    const data = req.body;

    if (data.event !== "messages.upsert") {
      return res.sendStatus(200);
    }

    const msg = data.data.messages[0];

    if (msg.key.remoteJid.includes("@g.us")) {
      return res.sendStatus(200);
    }

    const instance = data.instance || "instancia1";
    const phone = msg.key.remoteJid.replace("@s.whatsapp.net", "");
    const message = msg.message?.conversation || "";
    const name = msg.pushName || "Cliente";

    if (!message) return res.sendStatus(200);

    const key = `${instance}_${phone}`;

    let chatId = chats[key];

    // 🔥 cria sessão se não existir
    if (!chatId) {
      const session = await axios.post(
        `${BITRIX}imopenlines.session.start.json`,
        {
          USER_CODE: phone,
          USER_NAME: name,
          LINE_ID: LINE_ID,
          CONNECTOR_ID: instance
        }
      );

      chatId = session.data.result.CHAT_ID;
      chats[key] = chatId;

      console.log("Chat criado:", instance, phone, chatId);
    }

    // 🔥 envia mensagem pro Bitrix
    await axios.post(`${BITRIX}imopenlines.message.add.json`, {
      CHAT_ID: chatId,
      MESSAGE: `[${instance}] ${message}`
    });

    res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("OK");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando");
});