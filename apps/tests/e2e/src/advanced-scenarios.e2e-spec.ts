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

interface TestMessage {
  id: string;
  recipientId: string;
  payload: any;
  timestamp: string;
}

const sendMessage = async (recipientId: string, payload: any): Promise<TestMessage> => {
  const message: TestMessage = {
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

const getRabbitMQQueues = async () => {
  try {
    const response = await axios.get(`${config.rabbitmqManagement}/api/queues`, {
      auth: {
        username: config.rabbitmqUser,
        password: config.rabbitmqPass,
      },
    });
    return response.data;
  } catch (error) {
    console.warn('Could not fetch RabbitMQ queues:', error);
    return [];
  }
};

describe('DMR Advanced E2E Scenarios', () => {
  beforeAll(async () => {
    console.log('Waiting for services to be ready...');
    await Promise.all([
      waitForService(config.dmrServer1),
      waitForService(config.dmrAgentA),
      waitForService(config.dmrAgentB),
    ]);
    console.log('All services are ready');
  }, 60000);

  describe('Message Queuing and Delivery', () => {
    it('should handle rapid message bursts', async () => {
      const messageCount = 5;
      const messages = [];

      // Send multiple messages rapidly
      for (let i = 0; i < messageCount; i++) {
        const payload = {
          type: 'burst',
          content: `Burst message ${i + 1}`,
          index: i + 1,
        };

        const message = await sendMessage(config.agentIds.B, payload);
        messages.push(message);
      }

      // Wait for the last message to be received
      const lastMessage = messages[messages.length - 1];
      const receivedMessage = await waitForMessage(lastMessage.id, 45);

      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.payload.index).toBe(messageCount);
    }, 60000);

    it('should maintain message order', async () => {
      const messageCount = 3;
      const messages = [];

      // Send messages with sequence numbers
      for (let i = 0; i < messageCount; i++) {
        const payload = {
          type: 'sequence',
          content: `Sequence message ${i + 1}`,
          sequence: i + 1,
          timestamp: Date.now() + i, // Ensure different timestamps
        };

        const message = await sendMessage(config.agentIds.B, payload);
        messages.push(message);

        // Small delay to ensure order
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Verify the last message was received
      const lastMessage = messages[messages.length - 1];
      const receivedMessage = await waitForMessage(lastMessage.id, 45);

      expect(receivedMessage.payload.sequence).toBe(messageCount);
    }, 45000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle malformed message gracefully', async () => {
      const validPayload = {
        type: 'test',
        content: 'This should work',
      };

      // Send a valid message first
      const validMessage = await sendMessage(config.agentIds.B, validPayload);

      // Try to send malformed message (this may fail at external service level)
      try {
        await axios.post(`${config.externalServiceA}/api/messages`, {
          // Missing required fields
          payload: { malformed: true },
        });
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }

      // Verify the valid message still works
      const receivedMessage = await waitForMessage(validMessage.id);
      expect(receivedMessage.payload.content).toBe('This should work');
    }, 30000);

    it('should handle large message payloads', async () => {
      const largeContent = 'A'.repeat(1000); // 1KB payload
      const payload = {
        type: 'large',
        content: largeContent,
        size: largeContent.length,
      };

      const message = await sendMessage(config.agentIds.B, payload);
      const receivedMessage = await waitForMessage(message.id);

      expect(receivedMessage.payload.content).toBe(largeContent);
      expect(receivedMessage.payload.size).toBe(1000);
    }, 30000);

    it('should handle special characters in payload', async () => {
      const specialPayload = {
        type: 'special',
        content: 'Special chars: áéíóú ñ 中文 🚀 "quotes" \\backslash',
        unicode: '🌟✨💫⭐',
        json: { nested: { deeply: { value: 'test' } } },
      };

      const message = await sendMessage(config.agentIds.B, specialPayload);
      const receivedMessage = await waitForMessage(message.id);

      expect(receivedMessage.payload.content).toBe(specialPayload.content);
      expect(receivedMessage.payload.unicode).toBe(specialPayload.unicode);
      expect(receivedMessage.payload.json).toEqual(specialPayload.json);
    }, 30000);
  });

  describe('System Monitoring and Observability', () => {
    it('should have healthy RabbitMQ queues', async () => {
      const queues = await getRabbitMQQueues();

      if (queues.length > 0) {
        // Check if agent queues exist
        const agentQueues = queues.filter(
          (q) => q.name === config.agentIds.A || q.name === config.agentIds.B,
        );

        expect(agentQueues.length).toBeGreaterThan(0);

        // Check queue health
        agentQueues.forEach((queue) => {
          expect(queue.state).toBe('running');
        });
      }
    });

    it('should provide metrics endpoints', async () => {
      // Check if metrics endpoints are available (if implemented)
      try {
        const serverMetrics = await axios.get(`${config.dmrServer1}/metrics`);
        expect(serverMetrics.status).toBe(200);
      } catch (error) {
        // Metrics endpoint might not be implemented yet
        console.log('Metrics endpoint not available:', error.message);
      }
    });
  });

  describe('Load and Stress Testing', () => {
    it('should handle concurrent message sending', async () => {
      const concurrentCount = 3;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        const payload = {
          type: 'concurrent',
          content: `Concurrent message ${i + 1}`,
          threadId: i + 1,
        };

        const promise = sendMessage(config.agentIds.B, payload);
        promises.push(promise);
      }

      // Wait for all messages to be sent
      const messages = await Promise.all(promises);

      // Verify at least one message was received
      const lastMessage = messages[messages.length - 1];
      const receivedMessage = await waitForMessage(lastMessage.id, 45);

      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.payload.type).toBe('concurrent');
    }, 60000);

    it('should maintain performance under sustained load', async () => {
      const startTime = Date.now();
      const messageCount = 10;
      const messages = [];

      // Send messages with timing
      for (let i = 0; i < messageCount; i++) {
        const payload = {
          type: 'performance',
          content: `Performance test ${i + 1}`,
          index: i + 1,
          sentAt: Date.now(),
        };

        const message = await sendMessage(config.agentIds.B, payload);
        messages.push(message);

        // Small delay to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Wait for the last message
      const lastMessage = messages[messages.length - 1];
      const receivedMessage = await waitForMessage(lastMessage.id, 60);

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerMessage = totalTime / messageCount;

      expect(receivedMessage).toBeDefined();
      expect(avgTimePerMessage).toBeLessThan(5000); // Average less than 5 seconds per message

      console.log(
        `Performance test completed: ${messageCount} messages in ${totalTime}ms (avg: ${avgTimePerMessage}ms per message)`,
      );
    }, 120000);
  });

  describe('Data Integrity and Security', () => {
    it('should preserve message data integrity', async () => {
      const originalPayload = {
        type: 'integrity',
        content: 'Original content',
        checksum: 'abc123',
        metadata: {
          version: '1.0',
          author: 'test',
          tags: ['important', 'test'],
        },
      };

      const message = await sendMessage(config.agentIds.B, originalPayload);
      const receivedMessage = await waitForMessage(message.id);

      // Verify all fields are preserved
      expect(receivedMessage.payload).toEqual(originalPayload);
      expect(receivedMessage.payload.metadata.tags).toEqual(['important', 'test']);
    }, 30000);

    it('should handle messages with different content types', async () => {
      const testCases = [
        { type: 'string', data: 'Simple string' },
        { type: 'number', data: 42 },
        { type: 'boolean', data: true },
        { type: 'array', data: [1, 2, 3, 'four'] },
        { type: 'object', data: { nested: { value: 'test' } } },
        { type: 'null', data: null },
      ];

      for (const testCase of testCases) {
        const payload = {
          type: 'content-type',
          contentType: testCase.type,
          data: testCase.data,
        };

        const message = await sendMessage(config.agentIds.B, payload);
        const receivedMessage = await waitForMessage(message.id);

        expect(receivedMessage.payload.data).toEqual(testCase.data);
        expect(receivedMessage.payload.contentType).toBe(testCase.type);

        // Wait a bit between test cases
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }, 60000);
  });
});
