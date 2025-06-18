import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AgentEncryptedMessageDto, MessageType } from '@dmr/shared';
import { rabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { SchedulerRegistry } from '@nestjs/schedule';

describe('RabbitMQService - Message Forwarding', () => {
  let service: RabbitMQService;
  let eventEmitter: EventEmitter2;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();

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
            on: vi.fn(),
            once: vi.fn(),
            removeListener: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Mock logger methods
    loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    // Mock the connection to RabbitMQ
    vi.spyOn(service as any, '_connection', 'get').mockReturnValue({
      createChannel: vi.fn().mockResolvedValue({
        consume: vi.fn(),
        ack: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    loggerSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  describe('forwardMessageToAgent', () => {
    it('should parse JSON message and emit event with AgentEncryptedMessageDto', () => {
      const queueName = 'test-agent-id';
      const messageContent = JSON.stringify({ data: 'test message' });
      
      service.forwardMessageToAgent(queueName, messageContent);
      
      expect(eventEmitter.emit).toHaveBeenCalledWith('rabbitmq.message', {
        agentId: queueName,
        message: expect.objectContaining({
          id: expect.any(String),
          timestamp: expect.any(String),
          senderId: 'dmr-server',
          recipientId: queueName,
          type: MessageType.Message,
          payload: messageContent,
        }),
      });
    });

    it('should handle non-JSON message content', () => {
      const queueName = 'test-agent-id';
      const messageContent = 'This is not valid JSON';
      
      service.forwardMessageToAgent(queueName, messageContent);
      
      expect(eventEmitter.emit).toHaveBeenCalledWith('rabbitmq.message', {
        agentId: queueName,
        message: expect.objectContaining({
          id: expect.any(String),
          timestamp: expect.any(String),
          senderId: 'dmr-server',
          recipientId: queueName,
          type: MessageType.Message,
          payload: messageContent,
        }),
      });
    });

    it('should handle errors during event emission', () => {
      const queueName = 'test-agent-id';
      const messageContent = JSON.stringify({ data: 'test message' });
      
      // Mock eventEmitter.emit to throw an error
      vi.spyOn(eventEmitter, 'emit').mockImplementation(() => {
        throw new Error('Event emission error');
      });
      
      // This should not throw
      service.forwardMessageToAgent(queueName, messageContent);
      
      // Verify error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error forwarding message to agent test-agent-id:',
        expect.any(Error)
      );
    });
  });

  describe('subscribe with message forwarding', () => {
    it('should call forwardMessageToAgent when a message is received', async () => {
      const queueName = 'test-agent-id';
      const mockConsumerTag = 'consumer-tag-123';
      const mockMessage = {
        content: Buffer.from(JSON.stringify({ data: 'test message' })),
      };
      
      // Mock the channel.consume method to capture the callback
      let consumeCallback: Function;
      const consumeMock = vi.fn().mockImplementation((queue, callback) => {
        consumeCallback = callback;
        return Promise.resolve({ consumerTag: mockConsumerTag });
      });
      
      const ackMock = vi.fn();
      
      // Set up the channel mock
      vi.spyOn(service as any, '_channel', 'get').mockReturnValue({
        consume: consumeMock,
        ack: ackMock,
        checkQueue: vi.fn().mockResolvedValue(true),
      });
      
      // Mock forwardMessageToAgent
      const forwardSpy = vi.spyOn(service, 'forwardMessageToAgent');
      
      // Call subscribe
      await service.subscribe(queueName);
      
      // Verify consume was called
      expect(consumeMock).toHaveBeenCalledWith(queueName, expect.any(Function), { noAck: false });
      
      // Simulate receiving a message by calling the captured callback
      consumeCallback(mockMessage);
      
      // Verify forwardMessageToAgent was called with the right arguments
      expect(forwardSpy).toHaveBeenCalledWith(
        queueName,
        JSON.stringify({ data: 'test message' })
      );
      
      // Verify message was acknowledged
      expect(ackMock).toHaveBeenCalledWith(mockMessage);
    });

    it('should handle errors during message processing', async () => {
      const queueName = 'test-agent-id';
      const mockConsumerTag = 'consumer-tag-123';
      const mockMessage = {
        content: Buffer.from('invalid content'),
      };
      
      // Mock the channel.consume method to capture the callback
      let consumeCallback: Function;
      const consumeMock = vi.fn().mockImplementation((queue, callback) => {
        consumeCallback = callback;
        return Promise.resolve({ consumerTag: mockConsumerTag });
      });
      
      const ackMock = vi.fn();
      
      // Set up the channel mock
      vi.spyOn(service as any, '_channel', 'get').mockReturnValue({
        consume: consumeMock,
        ack: ackMock,
        checkQueue: vi.fn().mockResolvedValue(true),
      });
      
      // Mock forwardMessageToAgent to throw an error
      vi.spyOn(service, 'forwardMessageToAgent').mockImplementation(() => {
        throw new Error('Processing error');
      });
      
      // Call subscribe
      await service.subscribe(queueName);
      
      // Simulate receiving a message by calling the captured callback
      consumeCallback(mockMessage);
      
      // Verify error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing message from queue ${queueName}:`,
        expect.any(Error)
      );
      
      // Verify message was still acknowledged despite the error
      expect(ackMock).toHaveBeenCalledWith(mockMessage);
    });
  });
});
