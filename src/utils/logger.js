const LEVEL_PRIORITY = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL  = LEVEL_PRIORITY[process.env.LOG_LEVEL || 'info'] ?? 1;

const COLORS = {
  debug: '\x1b[36m',   // cyan
  info:  '\x1b[32m',   // green
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
  reset: '\x1b[0m',
};

function log(level, message, meta) {
  if ((LEVEL_PRIORITY[level] ?? 0) < CURRENT_LEVEL) return;
  const ts    = new Date().toISOString();
  const color = COLORS[level] || '';
  const metaStr = meta ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}` : '';
  const label = level.toUpperCase().padEnd(5);
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `${color}[${ts}] [${label}]${COLORS.reset} ${message}${metaStr}`
  );
}

const logger = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

module.exports = logger;