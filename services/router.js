const config = require("../config/instances");

function getInstance(instanceId) {
  return config.instances[instanceId] || null;
}

module.exports = { getInstance };