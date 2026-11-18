function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  info: (message) => console.log(`[${getTimestamp()}] [INFO] ${message}`),
  warn: (message) => console.warn(`[${getTimestamp()}] [WARN] ${message}`),
  error: (message, err) => {
    const detail = err instanceof Error ? ` | ${err.message}` : err ? ` | ${err}` : '';
    console.error(`[${getTimestamp()}] [ERROR] ${message}${detail}`);
  },
};

module.exports = logger;