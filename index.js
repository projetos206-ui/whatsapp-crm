const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

const webhook = require("./routes/webhook");

const app = express();
app.use(bodyParser.json());

app.use("/webhook", webhook);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    env: process.env.PORT
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});