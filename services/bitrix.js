const axios = require("axios");

async function sendToBitrix({ phone, message, userId }) {
  await axios.post(`${process.env.BITRIX_URL}crm.lead.add`, {
    fields: {
      TITLE: `WhatsApp ${phone}`,
      PHONE: [{ VALUE: phone, VALUE_TYPE: "MOBILE" }],
      COMMENTS: message,
      ASSIGNED_BY_ID: userId
    }
  });
}

module.exports = { sendToBitrix };