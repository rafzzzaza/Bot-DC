require('dotenv').config();
const logger = require('../utils/logger');

if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN belum diisi di file .env');
  process.exit(1);
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN.trim(),
  reconnectDelayMs: Number(process.env.RECONNECT_DELAY_MS) || 3000,
};