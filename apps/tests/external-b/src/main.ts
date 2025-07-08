import { ExternalServiceMessageDto, MessageType } from '@dmr/shared';
import { plainToInstance } from 'class-transformer';
import express, { Request, Response } from 'express';
import 'reflect-metadata';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8074;
const host = '0.0.0.0';

interface TestMessage {
  id: string;
  type: MessageType;
  payload: string;
  timestamp: string;
  senderId: string;
  recipientId: string;
}

let lastReceivedMessage: TestMessage | null = null;

const app = express();
app.use(express.json());

// Endpoint to receive messages from DMR Agent B
app.post('/api/messages', (
  request: Request<Record<string, never>, unknown, Record<string, unknown>>,
  response: Response,
) => {
  const message = plainToInstance(ExternalServiceMessageDto, request.body);
  console.log('[External B] Received message from DMR Agent B:', message);

  lastReceivedMessage = {
    id: message.id,
    type: message.type,
    payload: message.payload?.messages?.[0]?.content || '',
    timestamp: message.timestamp,
    senderId: message.senderId,
    recipientId: message.recipientId,
  };

  response.status(200).json({ status: 'ok' });
});

// Endpoint to get the last received message
app.get('/api/messages/last', (_request: Request, response: Response) => {
  response.status(200).json(lastReceivedMessage);
});

// Endpoint to clear messages (for cleanup)
app.delete('/api/messages', (_request: Request, response: Response) => {
  lastReceivedMessage = null;
  response.status(200).json({ status: 'ok' });
});

app.listen(port, host, () => {
  console.log(`[External B] Server is running on ${host}:${port}`);
});
