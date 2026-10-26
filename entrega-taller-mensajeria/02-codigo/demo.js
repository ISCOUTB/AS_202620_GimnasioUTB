const {
  InMemoryMessageQueue,
  createConsumer,
  createProducer,
} = require('./index');

async function main() {
  const queue = new InMemoryMessageQueue();
  const accessProjection = { ENTRADA: 0, SALIDA: 0 };
  const producer = createProducer(queue);
  const consumer = createConsumer({
    handleMessage: async (message) => {
      accessProjection[message.data.tipoAcceso] += 1;
    },
  });

  const message = producer.publishAccess('ENTRADA');
  const receivedMessage = queue.receive();
  const result = await consumer.process(receivedMessage);

  process.stdout.write(`${JSON.stringify({
    publishedMessage: message,
    processingResult: result,
    accessProjection,
    metrics: consumer.metrics,
    deadLetterCount: consumer.deadLetterQueue.length,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
