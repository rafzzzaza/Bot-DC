const { Client, GatewayIntentBits, Events } = require('discord.js');
const config = require('./config/env');
const logger = require('./utils/logger');
const VoiceManager = require('./services/voiceManager');
const kawanjoinCommand = require('./commands/kawanjoin');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const voiceManager = new VoiceManager(client, config);
const commandsPayload = [kawanjoinCommand.data.toJSON()];

async function registerGuildCommands(guild) {
  try {
    await guild.commands.set(commandsPayload);
  } catch (err) {
    logger.error(`Gagal mendaftarkan slash command di ${guild.name}`, err);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Bot aktif sebagai ${readyClient.user.tag}`);

  for (const guild of readyClient.guilds.cache.values()) {
    await registerGuildCommands(guild);
  }
  logger.info('Slash command /kawanjoin siap digunakan.');

  voiceManager.restorePreviousSession();
});

client.on(Events.GuildCreate, async (guild) => {
  await registerGuildCommands(guild);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === kawanjoinCommand.data.name) {
    await kawanjoinCommand.execute(interaction, voiceManager);
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  voiceManager.handleVoiceStateUpdate(oldState, newState);
});

client.on(Events.Error, (err) => {
  logger.error('Discord client error', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection (proses dipertahankan)', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception (proses dipertahankan)', err);
});

function handleShutdown(signal) {
  logger.info(`Menerima sinyal ${signal}, menutup bot...`);
  voiceManager.shutdown();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

client.login(config.discordToken).catch((err) => {
  logger.error('Gagal login ke Discord', err);
  process.exit(1);
});