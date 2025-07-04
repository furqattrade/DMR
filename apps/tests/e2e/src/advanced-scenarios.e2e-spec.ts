import { AgentMessageDto, MessageType } from '@dmr/shared';
import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { waitForHealthyServices } from './helpers/health-check.helper';
import { sendMessage } from './helpers/message.helper';

interface ReceivedMessage {
  id: string;
  type: MessageType;
  payload: string;
  timestamp: string;
  senderId: string;
  recipientId: string;
}

describe('DMR Basic Message Flow E2E Test', () => {
  beforeAll(async () => {
    console.log('Waiting for services to be ready...');
    await waitForHealthyServices();
    console.log('All services are ready');
  });

  afterAll(async () => {
    // Clear messages
    await fetch(`${process.env.EXTERNAL_SERVICE_B_URL}/api/messages`, { method: 'DELETE' });
  });

  const waitForMessage = async (
    expectedId: string,
    maxAttempts = 60,
    delay = 500,
  ): Promise<ReceivedMessage | null> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${process.env.EXTERNAL_SERVICE_B_URL}/api/messages/last`);
      const message = (await response.json()) as ReceivedMessage;

      if (message && message.id === expectedId) {
        return message;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  };

  it('should deliver a message from Agent A to Agent B', async () => {
    const messageId = uuidv4();
    const message: AgentMessageDto = {
      id: messageId,
      type: MessageType.ChatMessage,
      payload: 'Hello from Agent A!',
      timestamp: new Date().toISOString(),
      senderId: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
      recipientId: 'a1e45678-12bc-4ef0-9876-def123456789',
    };

    await sendMessage(message);

    const receivedMessage = await waitForMessage(messageId);
    expect(receivedMessage).toBeDefined();
    expect(receivedMessage?.id).toBe(messageId);
    expect(receivedMessage?.type).toBe(MessageType.ChatMessage);
    expect(receivedMessage?.payload).toBe('Hello from Agent A!');
    expect(receivedMessage?.senderId).toBe('d3b07384-d9a0-4c3f-a4e2-123456789abc');
    expect(receivedMessage?.recipientId).toBe('a1e45678-12bc-4ef0-9876-def123456789');
  });
});
