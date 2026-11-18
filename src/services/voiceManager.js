const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const logger = require('../utils/logger');
const { saveState, loadState } = require('../utils/storage');

const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);

class VoiceManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.targetGuildId = null;
    this.targetChannelId = null;
    this.reconnectTimer = null;
    this.keepaliveTimer = null;
    this.isConnecting = false;
    this.isShuttingDown = false;
  }

  restorePreviousSession() {
    const saved = loadState();
    if (saved?.guildId && saved?.channelId) {
      this.targetGuildId = saved.guildId;
      this.targetChannelId = saved.channelId;
      logger.info(`Memulihkan sesi terakhir di channel ${this.targetChannelId}...`);
      this.connect();
    }
  }

  async setTargetAndConnect(guildId, channelId) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.targetGuildId && this.targetGuildId !== guildId) {
      this.destroyConnection(this.targetGuildId);
    }

    this.targetGuildId = guildId;
    this.targetChannelId = channelId;
    saveState({ guildId, channelId });

    await this.connect(true);
  }

  startKeepalive(connection) {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      if (connection.state.status === VoiceConnectionStatus.Ready) {
        try {
          connection.playOpusPacket(SILENCE_FRAME);
        } catch (err) {
          logger.warn(`Gagal mengirim UDP keepalive: ${err.message}`);
        }
      }
    }, 20_000);
  }

  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  scheduleRejoin(delay = 1_500) {
    if (this.isShuttingDown || !this.targetGuildId || !this.targetChannelId) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const existing = getVoiceConnection(this.targetGuildId);

      if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
        logger.info('Melakukan rejoin in-place...');
        try {
          existing.rejoin({
            channelId: this.targetChannelId,
            selfDeaf: true,
            selfMute: false,
          });
          await entersState(existing, VoiceConnectionStatus.Ready, 15_000);
          logger.info('Rejoin berhasil, sesi voice tetap terjaga.');
          return;
        } catch {
          logger.warn('Rejoin in-place timeout, membuat ulang koneksi...');
        }
      }

      this.connect(true);
    }, delay);
  }

  destroyConnection(guildId = this.targetGuildId) {
    this.stopKeepalive();
    if (!guildId) return;
    const existing = getVoiceConnection(guildId);
    if (existing) {
      try {
        existing.destroy();
      } catch (err) {
        logger.error('Gagal menghancurkan koneksi voice lama', err);
      }
    }
  }

  async connect(forceNew = false) {
    if (this.isConnecting || this.isShuttingDown) return;
    if (!this.targetGuildId || !this.targetChannelId) return;

    this.isConnecting = true;

    try {
      const guild = await this.client.guilds.fetch(this.targetGuildId);
      const channel = await guild.channels.fetch(this.targetChannelId);

      if (!channel || !channel.isVoiceBased()) {
        logger.error('Channel target tidak ditemukan atau bukan voice channel.');
        return;
      }

      if (forceNew) {
        this.destroyConnection(guild.id);
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      this.registerConnectionEvents(connection);

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      this.startKeepalive(connection);
      logger.info(`Terhubung & standby di #${channel.name} (${channel.id})`);
    } catch (err) {
      logger.error('Gagal terhubung ke voice channel, menjadwalkan ulang...', err);
      this.scheduleRejoin(this.config.reconnectDelayMs);
    } finally {
      this.isConnecting = false;
    }
  }

  registerConnectionEvents(connection) {
    connection.removeAllListeners();

    connection.on(VoiceConnectionStatus.Ready, () => {
      this.startKeepalive(connection);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (this.isShuttingDown) return;

      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        logger.warn('Koneksi voice terputus, memicu rejoin in-place...');
        this.scheduleRejoin(1_500);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.stopKeepalive();
      if (!this.isShuttingDown) {
        logger.warn('Objek koneksi hancur, menyambung ulang...');
        this.scheduleRejoin(2_000);
      }
    });

    connection.on('error', (err) => {
      logger.error('Error pada voice connection', err);
    });
  }

  handleVoiceStateUpdate(oldState, newState) {
    if (this.isShuttingDown || !this.targetChannelId) return;
    if (newState.id !== this.client.user.id) return;

    if (!newState.channelId) {
      logger.warn('Bot terdeteksi keluar dari voice channel, masuk kembali...');
      this.scheduleRejoin(1_000);
      return;
    }

    if (newState.channelId !== this.targetChannelId) {
      logger.warn('Bot dipindah ke channel lain, mengembalikan ke channel target...');
      this.scheduleRejoin(1_500);
    }
  }

  shutdown() {
    this.isShuttingDown = true;
    this.stopKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.destroyConnection();
    logger.info('VoiceManager dimatikan dengan bersih.');
  }
}

module.exports = VoiceManager;