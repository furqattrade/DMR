import { CentOpsEvent } from '@dmr/shared';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';

describe('RabbitMQ Message Forwarding', () => {
  let service: RabbitMQService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        {
          provide: rabbitMQConfig.KEY,
          useValue: {
            port: 5672,
            hostname: 'localhost',
            username: '',
            password: '',
            ttl: 60000,
            dlqTTL: 60000,
            reconnectInterval: 5000,
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: { addInterval: vi.fn(), deleteInterval: vi.fn(), doesExist: vi.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    (service as any)._channel = {
      ack: vi.fn(),
    };
  });

  describe('forwardMessageToAgent', () => {
    it('should parse message content and emit event', () => {
      const agentId = 'test-agent-id';
      const mockMessage = {
        content: Buffer.from(
          JSON.stringify({
            id: 'test-message-id',
            senderId: 'test-sender-id',
            recipientId: agentId,
            timestamp: '2025-06-18T14:00:00Z',
            payload: '{"key":"value"}',
          }),
        ),
      } as ConsumeMessage;

      (service as any).forwardMessageToAgent(agentId, mockMessage);

      expect(eventEmitter.emit).toHaveBeenCalledWith(CentOpsEvent.FORWARD_MESSAGE_TO_AGENT, {
        agentId,
        message: expect.objectContaining({
          id: 'test-message-id',
          senderId: 'test-sender-id',
        }),
      });
    });

    it('should handle JSON parsing errors', () => {
      const agentId = 'test-agent-id';
      const mockMessage = {
        content: Buffer.from('invalid-json'),
      } as ConsumeMessage;

      const loggerSpy = vi.spyOn(Logger.prototype, 'error');

      (service as any).forwardMessageToAgent(agentId, mockMessage);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error forwarding message to agent ${agentId}`),
      );
    });
  });

  describe('subscribe method', () => {
    it('should process messages and acknowledge them', async () => {
      const queueName = 'test-queue';
      const mockMessage = {
        content: Buffer.from(
          JSON.stringify({
            id: 'test-message-id',
            senderId: 'test-sender-id',
          }),
        ),
      } as ConsumeMessage;

      let capturedCallback: (msg: ConsumeMessage) => void;
      (service as any)._channel.consume = vi.fn((queue, callback) => {
        capturedCallback = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      vi.spyOn(service, 'checkQueue').mockResolvedValue(true);

      const forwardSpy = vi.spyOn(service as any, 'forwardMessageToAgent');

      await service.subscribe(queueName);

      expect((service as any)._channel.consume).toHaveBeenCalledWith(
        queueName,
        expect.any(Function),
        { noAck: false },
      );

      capturedCallback(mockMessage);

      expect(forwardSpy).toHaveBeenCalledWith(queueName, mockMessage);

      expect((service as any)._channel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle errors and nack messages when processing fails', async () => {
      const queueName = 'test-queue';
      const mockMessage = {
        content: Buffer.from('invalid-json'),
      } as ConsumeMessage;

      let capturedCallback: (msg: ConsumeMessage) => void;
      (service as any)._channel.consume = vi.fn((queue, callback) => {
        capturedCallback = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      vi.spyOn(service, 'checkQueue').mockResolvedValue(true);

      vi.spyOn(service as any, 'forwardMessageToAgent').mockImplementation(() => {
        throw new Error('Test error');
      });

      (service as any)._channel.nack = vi.fn();

      await service.subscribe(queueName);

      capturedCallback(mockMessage);

      expect((service as any)._channel.ack).not.toHaveBeenCalled();
      expect((service as any)._channel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });
  });
});
