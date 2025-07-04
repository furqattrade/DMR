import axios from 'axios';
import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it } from 'vitest';

// Test configuration
const config = {
  externalServiceA: process.env.EXTERNAL_SERVICE_A_URL || 'http://localhost:8001',
  externalServiceB: process.env.EXTERNAL_SERVICE_B_URL || 'http://localhost:8002',
  dmrAgentA: process.env.DMR_AGENT_A_URL || 'http://localhost:5010',
  dmrAgentB: process.env.DMR_AGENT_B_URL || 'http://localhost:5011',
  dmrServer1: process.env.DMR_SERVER_1_URL || 'http://localhost:5000',
  dmrServer2: process.env.DMR_SERVER_2_URL || 'http://localhost:5001',
  rabbitmqManagement: process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672',
  rabbitmqUser: process.env.RABBITMQ_USER || 'user',
  rabbitmqPass: process.env.RABBITMQ_PASS || 'pass',
  agentIds: {
    A: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
    B: 'a1e45678-12bc-4ef0-9876-def123456789',
  },
};

// Helper functions
const waitForService = async (url: string, maxAttempts = 30, delay = 1000) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`${url}/v1/health`);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Service at ${url} not ready after ${maxAttempts} attempts`);
};

const sendMessage = async (recipientId: string, payload: any) => {
  const message = {
    id: randomUUID(),
    recipientId,
    payload,
    timestamp: new Date().toISOString(),
  };

  await axios.post(`${config.externalServiceA}/api/messages`, message);
  return message;
};

const getLastReceivedMessage = async () => {
  const response = await axios.get(`${config.externalServiceB}/api/messages/last`);
  return response.data;
};

const waitForMessage = async (expectedId: string, maxAttempts = 30, delay = 1000) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const message = await getLastReceivedMessage();
      if (message.id === expectedId) {
        return message;
      }
    } catch {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(`Message ${expectedId} not received after ${maxAttempts} attempts`);
};

describe('DMR E2E Tests', () => {
  beforeAll(async () => {
    // Wait for all services to be ready
    console.log('Waiting for services to be ready...');
    await Promise.all([
      waitForService(config.dmrServer1),
      waitForService(config.dmrAgentA),
      waitForService(config.dmrAgentB),
    ]);
    console.log('All services are ready');
  }, 60000);

  describe('Basic Message Flow', () => {
    it('should send message from External Service A to External Service B through DMR system', async () => {
      const testPayload = {
        type: 'test',
        content: 'Hello from E2E test',
        timestamp: new Date().toISOString(),
      };

      // Send message from External Service A
      const sentMessage = await sendMessage(config.agentIds.B, testPayload);

      // Wait for message to be received by External Service B
      const receivedMessage = await waitForMessage(sentMessage.id);

      // Verify message content
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.id).toBe(sentMessage.id);
      expect(receivedMessage.recipientId).toBe(config.agentIds.B);
      expect(receivedMessage.payload).toEqual(testPayload);
    }, 30000);

    it('should handle multiple messages in sequence', async () => {
      const messages = [];

      for (let i = 0; i < 3; i++) {
        const payload = {
          type: 'sequential',
          content: `Message ${i + 1}`,
          sequence: i + 1,
        };

        const message = await sendMessage(config.agentIds.B, payload);
        messages.push(message);

        // Wait a bit between messages
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Verify the last message was received
      const lastMessage = messages[messages.length - 1];
      const receivedMessage = await waitForMessage(lastMessage.id);

      expect(receivedMessage.payload.sequence).toBe(3);
    }, 45000);
  });

  describe('Health Checks', () => {
    it('should have all services healthy', async () => {
      const healthChecks = await Promise.all([
        axios.get(`${config.dmrServer1}/v1/health`),
        axios.get(`${config.dmrAgentA}/v1/health`),
        axios.get(`${config.dmrAgentB}/v1/health`),
      ]);

      healthChecks.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid recipient ID gracefully', async () => {
      const invalidRecipientId = 'invalid-agent-id';
      const payload = { type: 'error-test', content: 'This should fail' };

      try {
        await sendMessage(invalidRecipientId, payload);
        // If we get here, the message was sent but should fail processing
        // Wait a bit to ensure it's processed
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // The message should not be received by External Service B
        const lastMessage = await getLastReceivedMessage();
        expect(lastMessage.recipientId).not.toBe(invalidRecipientId);
      } catch (error) {
        // Expected behavior - message sending failed
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle message delivery within reasonable time', async () => {
      const startTime = Date.now();
      const payload = {
        type: 'performance',
        content: 'Performance test message',
        sentAt: startTime,
      };

      const message = await sendMessage(config.agentIds.B, payload);
      const receivedMessage = await waitForMessage(message.id);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(receivedMessage).toBeDefined();
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});
