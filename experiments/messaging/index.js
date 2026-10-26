const { randomUUID } = require('node:crypto');

const EVENT_TYPE = 'aforo.acceso.registrado';
const SCHEMA_VERSION = 1;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [100, 200];
const VALID_ACCESS_TYPES = new Set(['ENTRADA', 'SALIDA']);

class InvalidMessageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidMessageError';
  }
}

class RecoverableProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RecoverableProcessingError';
  }
}

class PermanentProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentProcessingError';
  }
}

function validateMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new InvalidMessageError('El mensaje debe ser un objeto JSON.');
  }
  if (typeof message.eventId !== 'string' || message.eventId.trim() === '') {
    throw new InvalidMessageError('eventId es obligatorio y debe ser una cadena no vacía.');
  }
  if (message.eventType !== EVENT_TYPE) {
    throw new InvalidMessageError(`eventType debe ser "${EVENT_TYPE}".`);
  }
  if (
    typeof message.occurredAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T/.test(message.occurredAt)
    || !/(Z|[+-]\d{2}:\d{2})$/.test(message.occurredAt)
    || Number.isNaN(Date.parse(message.occurredAt))
  ) {
    throw new InvalidMessageError('occurredAt debe ser una fecha ISO 8601 con zona horaria.');
  }
  if (message.schemaVersion !== SCHEMA_VERSION) {
    throw new InvalidMessageError(`schemaVersion no compatible: se requiere ${SCHEMA_VERSION}.`);
  }
  if (
    !message.data
    || typeof message.data !== 'object'
    || Array.isArray(message.data)
    || !VALID_ACCESS_TYPES.has(message.data.tipoAcceso)
    || Object.keys(message.data).some((key) => key !== 'tipoAcceso')
  ) {
    throw new InvalidMessageError('data debe contener únicamente tipoAcceso (ENTRADA o SALIDA).');
  }
}

function createMessage(tipoAcceso, { eventId = randomUUID(), now = () => new Date() } = {}) {
  const message = {
    eventId,
    eventType: EVENT_TYPE,
    occurredAt: now().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    data: { tipoAcceso },
  };
  validateMessage(message);
  return message;
}

class InMemoryMessageQueue {
  constructor() {
    this.messages = [];
  }

  publish(message) {
    validateMessage(message);
    this.messages.push(JSON.parse(JSON.stringify(message)));
  }

  receive() {
    return this.messages.shift();
  }

  get size() {
    return this.messages.length;
  }
}

function createProducer(queue, options = {}) {
  return {
    publishAccess(tipoAcceso) {
      const message = createMessage(tipoAcceso, options);
      queue.publish(message);
      return message;
    },
  };
}

function createConsumer({
  handleMessage,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
  now = () => new Date(),
  maxAttempts = MAX_ATTEMPTS,
  backoffMs = BACKOFF_MS,
} = {}) {
  if (typeof handleMessage !== 'function') {
    throw new TypeError('handleMessage debe ser una función.');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || backoffMs.length < maxAttempts - 1) {
    throw new TypeError('La política de reintentos requiere un máximo válido y un backoff por reintento.');
  }

  const processedEventIds = new Set();
  const inFlight = new Map();
  const deadLetterQueue = [];
  const metrics = {
    attempts: 0,
    processed: 0,
    duplicates: 0,
    retries: 0,
    permanentFailures: 0,
    deadLettered: 0,
  };

  function emit(message, fields) {
    log({
      timestamp: now().toISOString(),
      eventId: typeof message.eventId === 'string' ? message.eventId : null,
      eventType: typeof message.eventType === 'string' ? message.eventType : null,
      ...fields,
    });
  }

  function deadLetter(message, attempts, error) {
    const failure = {
      message,
      attempts,
      failedAt: now().toISOString(),
      error: error.message,
      errorType: error.name,
    };
    deadLetterQueue.push(failure);
    metrics.deadLettered += 1;
    emit(message, {
      level: 'error',
      result: 'dead_lettered',
      attempt: attempts,
      error: error.message,
      errorType: error.name,
    });
    return { status: 'dead-lettered', attempts, error: error.message };
  }

  async function processNewMessage(message) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      metrics.attempts += 1;
      emit(message, { level: 'info', result: 'attempt_started', attempt });
      try {
        await handleMessage(message);
        processedEventIds.add(message.eventId);
        metrics.processed += 1;
        emit(message, { level: 'info', result: 'processed', attempt });
        return { status: 'processed', attempts: attempt };
      } catch (error) {
        if (!(error instanceof RecoverableProcessingError)) {
          metrics.permanentFailures += 1;
          return deadLetter(message, attempt, error);
        }

        if (attempt === maxAttempts) {
          return deadLetter(message, attempt, error);
        }

        const delayMs = backoffMs[attempt - 1];
        metrics.retries += 1;
        emit(message, {
          level: 'warn',
          result: 'retry_scheduled',
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error: error.message,
          errorType: error.name,
        });
        await sleep(delayMs);
      }
    }
    throw new Error('Se alcanzó un estado inesperado en el ciclo de reintentos.');
  }

  async function process(message) {
    try {
      validateMessage(message);
    } catch (error) {
      if (!(error instanceof InvalidMessageError)) throw error;
      emit(message && typeof message === 'object' ? message : {}, {
        level: 'warn',
        result: 'rejected',
        attempt: 0,
        error: error.message,
        errorType: error.name,
      });
      throw error;
    }

    if (processedEventIds.has(message.eventId)) {
      metrics.duplicates += 1;
      emit(message, { level: 'info', result: 'duplicate', attempt: 0 });
      return { status: 'duplicate', attempts: 0 };
    }

    const activeWork = inFlight.get(message.eventId);
    if (activeWork) {
      await activeWork;
      metrics.duplicates += 1;
      emit(message, { level: 'info', result: 'duplicate', attempt: 0 });
      return { status: 'duplicate', attempts: 0 };
    }

    const work = processNewMessage(message);
    inFlight.set(message.eventId, work);
    try {
      return await work;
    } finally {
      inFlight.delete(message.eventId);
    }
  }

  return { process, deadLetterQueue, metrics };
}

module.exports = {
  BACKOFF_MS,
  EVENT_TYPE,
  MAX_ATTEMPTS,
  InMemoryMessageQueue,
  InvalidMessageError,
  PermanentProcessingError,
  RecoverableProcessingError,
  createConsumer,
  createMessage,
  createProducer,
};
