const express = require("express");
const bodyParser = require("body-parser");

const webhook = require("./routes/webhook");

const app = express();
app.use(bodyParser.json());

app.use("/webhook", webhook);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 rodando na porta", PORT);
});