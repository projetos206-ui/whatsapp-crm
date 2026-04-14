const axios = require("axios");

async function sendMessage(instance, number, text) {
  await axios.post(`${process.env.EVOLUTION_URL}/message/sendText`, {
    instance,
    number,
    text
  });
}

module.exports = { sendMessage };