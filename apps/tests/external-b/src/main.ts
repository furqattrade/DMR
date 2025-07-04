import express from 'express';

const host = process.env.HOST ?? 'localhost';
const port = 3002;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Store received messages for verification
const receivedMessages: any[] = [];

// Endpoint to receive messages from DMR Agent B
app.post('/api/messages', (request, response) => {
  const message = request.body;
  console.log('[External B] Received message from DMR Agent B:', message);

  // Store with timestamp
  receivedMessages.push({
    ...message,
    receivedAt: new Date().toISOString(),
  });

  response.status(200).json({ success: true, messageId: message.id });
});

// Endpoint to get the last received message (for e2e test verification)
app.get('/api/messages/last', (_, response) => {
  const lastMessage = receivedMessages[receivedMessages.length - 1];
  response.status(200).json(lastMessage || null);
});

// Endpoint to get all received messages (for e2e test verification)
app.get('/api/messages/received', (_, response) => {
  response.status(200).json(receivedMessages);
});

// Endpoint to clear received messages (for test cleanup)
app.delete('/api/messages', (_, response) => {
  receivedMessages.length = 0;
  response.status(200).json({ success: true, message: 'Messages cleared' });
});

// Health check
app.get('/health', (_, response) => {
  response.status(200).json({ status: 'healthy', service: 'external-service-b' });
});

app.listen(port, host, () => {
  console.log(`[External Service B] ready at http://${host}:${port}`);
});
