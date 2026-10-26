const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BACKOFF_MS,
  InMemoryMessageQueue,
  InvalidMessageError,
  PermanentProcessingError,
  RecoverableProcessingError,
  createConsumer,
  createProducer,
} = require('../02-codigo');

function makeMessage(eventId = 'evt-test-1') {
  const queue = new InMemoryMessageQueue();
  const producer = createProducer(queue, {
    eventId,
    now: () => new Date('2026-10-25T19:00:00.000Z'),
    log: () => {},
  });
  const message = producer.publishAccess('ENTRADA');
  return { queue, message };
}

test('procesar dos veces el mismo eventId no repite el efecto de negocio', async () => {
  const { message } = makeMessage();
  let businessEffects = 0;
  const consumer = createConsumer({
    handleMessage: async () => { businessEffects += 1; },
    log: () => {},
  });

  const first = await consumer.process(message);
  const duplicate = await consumer.process(message);

  assert.equal(first.status, 'processed');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(businessEffects, 1);
  assert.equal(consumer.metrics.duplicates, 1);
});

test('un fallo recuperable reintenta con backoff progresivo y luego procesa', async () => {
  const { message } = makeMessage();
  const delays = [];
  let calls = 0;
  const consumer = createConsumer({
    handleMessage: async () => {
      calls += 1;
      if (calls < 3) throw new RecoverableProcessingError('base temporalmente no disponible');
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    log: () => {},
  });

  const result = await consumer.process(message);

  assert.deepEqual(delays, BACKOFF_MS);
  assert.equal(calls, 3);
  assert.deepEqual(result, { status: 'processed', attempts: 3 });
  assert.equal(consumer.metrics.retries, 2);
  assert.equal(consumer.deadLetterQueue.length, 0);
});

test('tras tres fallos recuperables el mensaje termina en la DLQ', async () => {
  const { message } = makeMessage();
  const delays = [];
  const consumer = createConsumer({
    handleMessage: async () => { throw new RecoverableProcessingError('fallo persistente'); },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    log: () => {},
  });

  const result = await consumer.process(message);

  assert.deepEqual(delays, BACKOFF_MS);
  assert.deepEqual(result, { status: 'dead-lettered', attempts: 3, error: 'fallo persistente' });
  assert.equal(consumer.metrics.attempts, 3);
  assert.equal(consumer.metrics.deadLettered, 1);
  assert.equal(consumer.deadLetterQueue.length, 1);
  assert.equal(consumer.deadLetterQueue[0].message.eventId, message.eventId);
});

test('un error definitivo no se reintenta y va directamente a la DLQ', async () => {
  const { message } = makeMessage();
  let calls = 0;
  const consumer = createConsumer({
    handleMessage: async () => {
      calls += 1;
      throw new PermanentProcessingError('evento no procesable');
    },
    sleep: async () => assert.fail('un fallo definitivo no debe esperar ni reintentarse'),
    log: () => {},
  });

  const result = await consumer.process(message);

  assert.equal(result.status, 'dead-lettered');
  assert.equal(result.attempts, 1);
  assert.equal(calls, 1);
  assert.equal(consumer.metrics.permanentFailures, 1);
});

test('rechaza de manera controlada campos obligatorios ausentes y versiones incompatibles', async () => {
  const { message } = makeMessage();
  const consumer = createConsumer({ handleMessage: async () => {}, log: () => {} });
  const missingEventId = { ...message };
  delete missingEventId.eventId;
  const incompatibleVersion = { ...message, schemaVersion: 2 };
  const invalidDate = { ...message, occurredAt: '2026-02-31T19:00:00.000Z' };

  await assert.rejects(consumer.process(missingEventId), InvalidMessageError);
  await assert.rejects(consumer.process(incompatibleVersion), /schemaVersion no compatible/);
  await assert.rejects(consumer.process(invalidDate), /ISO 8601/);
  assert.equal(consumer.metrics.attempts, 0);
  assert.equal(consumer.deadLetterQueue.length, 0);
});

test('la publicación y el procesamiento se correlacionan mediante el mismo eventId', async () => {
  const queue = new InMemoryMessageQueue();
  const records = [];
  const now = () => new Date('2026-10-25T19:00:00.000Z');
  const producer = createProducer(queue, {
    eventId: 'evt-correlated-1',
    now,
    log: (record) => records.push(record),
  });
  const consumer = createConsumer({
    handleMessage: async () => {},
    now,
    log: (record) => records.push(record),
  });

  producer.publishAccess('ENTRADA');
  await consumer.process(queue.receive());

  const publishedRecord = records.find((record) => record.result === 'published');
  const processedRecord = records.find((record) => record.result === 'processed');
  assert.equal(publishedRecord.eventId, 'evt-correlated-1');
  assert.equal(processedRecord.eventId, publishedRecord.eventId);
  assert.equal(publishedRecord.correlationId, processedRecord.correlationId);
  assert.equal(processedRecord.correlationId, publishedRecord.eventId);
  assert.equal(publishedRecord.eventType, processedRecord.eventType);
});

test('emite logs estructurados con ID, tipo, intento y resultado', async () => {
  const { message } = makeMessage();
  const messageWithUnknownMetadata = { ...message, studentId: 'no-debe-registrarse' };
  const records = [];
  const consumer = createConsumer({
    handleMessage: async () => {},
    log: (record) => records.push(record),
  });

  await consumer.process(messageWithUnknownMetadata);

  assert.equal(records.length, 2);
  assert.equal(records.some((record) => Object.hasOwn(record, 'studentId')), false);
  assert.deepEqual(
    records.map(({ eventId, eventType, attempt, result }) => ({
      eventId,
      eventType,
      attempt,
      result,
    })),
    [
      {
        eventId: message.eventId,
        eventType: message.eventType,
        attempt: 1,
        result: 'attempt_started',
      },
      {
        eventId: message.eventId,
        eventType: message.eventType,
        attempt: 1,
        result: 'processed',
      },
    ]
  );
});

test('el consumidor deduplica también dos entregas concurrentes del mismo evento', async () => {
  const { message } = makeMessage();
  let businessEffects = 0;
  let finishWork;
  const consumer = createConsumer({
    handleMessage: async () => {
      businessEffects += 1;
      await new Promise((resolve) => { finishWork = resolve; });
    },
    log: () => {},
  });

  const first = consumer.process(message);
  await new Promise((resolve) => setImmediate(resolve));
  const duplicate = consumer.process(message);
  finishWork();

  assert.deepEqual(await Promise.all([first, duplicate]), [
    { status: 'processed', attempts: 1 },
    { status: 'duplicate', attempts: 0 },
  ]);
  assert.equal(businessEffects, 1);
});

test('dos entregas concurrentes de un mensaje fallido no confunden el fallo con un duplicado exitoso', async () => {
  const { message } = makeMessage();
  let calls = 0;
  let finishFirstAttempt;
  const firstAttemptGate = new Promise((resolve) => { finishFirstAttempt = resolve; });
  const consumer = createConsumer({
    handleMessage: async () => {
      calls += 1;
      if (calls === 1) await firstAttemptGate;
      throw new RecoverableProcessingError('base temporalmente no disponible');
    },
    sleep: async () => {},
    log: () => {},
  });

  const first = consumer.process(message);
  await new Promise((resolve) => setImmediate(resolve));
  const concurrentDelivery = consumer.process(message);
  finishFirstAttempt();

  const results = await Promise.all([first, concurrentDelivery]);
  assert.equal(results[0].status, 'dead-lettered');
  assert.deepEqual(results[1], results[0]);
  assert.equal(calls, 3);
  assert.equal(consumer.metrics.duplicates, 0);
  assert.equal(consumer.deadLetterQueue.length, 1);
});
