const axios = require("axios");

function cleanPhone(phone) {
  if (!phone) return "";

  return phone
    .replace("@s.whatsapp.net", "")
    .replace("@g.us", "")
    .replace(/\D/g, "");
}

async function sendToBitrix({ phone, message, userId }) {
  try {
    const clean = cleanPhone(phone);

    const url = `${process.env.BITRIX_URL}crm.lead.add.json`;

    const payload = {
      fields: {
        TITLE: `WhatsApp ${clean}`,
        PHONE: [{ VALUE: clean, VALUE_TYPE: "MOBILE" }],
        COMMENTS: message,
        ASSIGNED_BY_ID: userId
      }
    };

    const res = await axios.post(url, payload);

    console.log("✅ Bitrix OK:", res.data);
  } catch (err) {
    console.log("❌ Bitrix ERROR:");
    console.log(err.response?.data || err.message);
  }
}

module.exports = { sendToBitrix };