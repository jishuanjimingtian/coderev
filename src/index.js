const { reviewDiff } = require('./reviewer');
const { loadConfig, getApiKey } = require('./config');

module.exports = {
  reviewDiff,
  loadConfig,
  getApiKey,
};
