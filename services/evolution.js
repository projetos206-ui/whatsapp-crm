const axios = require("axios");

async function sendMessage(instance, number, text) {
  try {
    await axios.post(`${process.env.EVOLUTION_BASE_URL}/message/sendText`, {
      instance,
      number,
      text
    });
  } catch (err) {
    console.log("❌ Evolution error:", err.message);
  }
}

module.exports = { sendMessage };