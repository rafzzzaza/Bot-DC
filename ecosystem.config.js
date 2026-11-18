module.exports = {
  apps: [
    {
      name: 'voice-247',
      script: 'src/index.js',
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};