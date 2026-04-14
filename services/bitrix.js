const axios = require("axios");

async function sendToBitrix({ phone, message, userId }) {
  try {
    const cleanPhone = phone.replace("@s.whatsapp.net", "");

    const url = `${process.env.BITRIX_URL}crm.lead.add.json`;

    const res = await axios.post(url, {
      fields: {
        TITLE: `WhatsApp ${cleanPhone}`,
        PHONE: [{ VALUE: cleanPhone, VALUE_TYPE: "MOBILE" }],
        COMMENTS: message,
        ASSIGNED_BY_ID: userId
      }
    });

    console.log("🚀 BITRIX OK:", res.data);

  } catch (err) {
    console.log("❌ BITRIX ERROR:", err.response?.data || err.message);
  }
}

module.exports = { sendToBitrix };