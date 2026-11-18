const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kawanjoin')
    .setDescription('Panggil bot masuk ke voice channel kamu dan standby 24/7'),

  async execute(interaction, voiceManager) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'Command ini hanya bisa digunakan di dalam server.',
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: 'Masuk ke voice channel dulu sebelum menjalankan `/kawanjoin`.',
        ephemeral: true,
      });
    }

    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const permissions = voiceChannel.permissionsFor(me);

    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
      return interaction.reply({
        content: `Bot tidak punya izin **View Channel** atau **Connect** di **${voiceChannel.name}**.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await voiceManager.setTargetAndConnect(interaction.guild.id, voiceChannel.id);
      await interaction.editReply(`Masuk ke **${voiceChannel.name}** dan standby 24/7.`);
    } catch (err) {
      logger.error('Gagal mengeksekusi /kawanjoin', err);
      await interaction.editReply('Gagal masuk ke voice channel. Cek log server untuk detailnya.');
    }
  },
};