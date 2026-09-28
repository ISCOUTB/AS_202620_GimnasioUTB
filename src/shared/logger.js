function createLogger(write = (line) => process.stdout.write(`${line}\n`)) {
  function emit(level, event, message) {
    write(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
    }));
  }

  return {
    info: (event, message) => emit('info', event, message),
    warn: (event, message) => emit('warn', event, message),
    error: (event, message) => emit('error', event, message),
  };
}

const logger = createLogger();

module.exports = { createLogger, logger };