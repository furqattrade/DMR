import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { AgentMessageDto } from '@dmr/shared';
import { MessageValidatorService } from './message-validator.service';
import { RabbitMQMessageService } from '../../libs/rabbitmq';

const mockRabbitMQMessageService = {
  sendValidMessage: vi.fn(),
  sendValidationFailure: vi.fn(),
};

describe('MessageValidatorService', () => {
  let service: MessageValidatorService;
  let rabbitMQMessageService: RabbitMQMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageValidatorService,
        {
          provide: RabbitMQMessageService,
          useValue: mockRabbitMQMessageService,
        },
      ],
    }).compile();

    service = module.get<MessageValidatorService>(MessageValidatorService);
    rabbitMQMessageService = module.get<RabbitMQMessageService>(RabbitMQMessageService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateMessage', () => {
    it('should validate a properly formatted message', async () => {
      const messageData = {
        id: 'msg-123',
        senderId: 'agent-1',
        recipientId: 'agent-2',
        timestamp: new Date().toISOString(),
        type: 'TEST_MESSAGE',
        payload: 'test payload',
      };

      const result = await service.validateMessage(messageData);

      expect(result).toEqual(
        expect.objectContaining({
          id: messageData.id,
          senderId: messageData.senderId,
          recipientId: messageData.recipientId,
        }),
      );
      expect(mockRabbitMQMessageService.sendValidMessage).toHaveBeenCalledWith(result);
    });

    it('should reject null/undefined message data', async () => {
      await expect(service.validateMessage(null)).rejects.toThrow(BadRequestException);
      await expect(service.validateMessage(undefined)).rejects.toThrow(BadRequestException);
    });

    it('should reject messages with missing required fields', async () => {
      const incompleteMessage = {
        id: 'msg-123',
        // Missing senderId
        recipientId: 'agent-2',
        payload: 'test payload',
      };

      await expect(service.validateMessage(incompleteMessage)).rejects.toThrow(BadRequestException);
    });

    it('should handle complex message objects with nested properties', async () => {
      const complexMessageData = {
        id: 'complex-123',
        senderId: 'complex-sender',
        recipientId: 'complex-recipient',
        timestamp: new Date().toISOString(),
        type: 'COMPLEX_MESSAGE',
        payload: {
          content: 'nested content',
          values: [1, 2, 3],
        },
      };

      const result = await service.validateMessage(complexMessageData);

      expect(result).toEqual(
        expect.objectContaining({
          id: complexMessageData.id,
          senderId: complexMessageData.senderId,
          recipientId: complexMessageData.recipientId,
        }),
      );
      expect(mockRabbitMQMessageService.sendValidMessage).toHaveBeenCalledWith(result);
    });

    it('should store validation failures in the validation-failures queue', async () => {
      const invalidMessage = {
        id: 'invalid-123',
        // Missing required fields
      };

      const receivedAt = new Date().toISOString();
      vi.useFakeTimers();
      vi.setSystemTime(new Date(receivedAt));

      await expect(service.validateMessage(invalidMessage)).rejects.toThrow(BadRequestException);

      expect(mockRabbitMQMessageService.sendValidationFailure).toHaveBeenCalledWith(
        invalidMessage,
        expect.any(Array),
        receivedAt,
      );

      vi.useRealTimers();
    });

    it('should handle empty objects', async () => {
      const emptyMessage = {};

      await expect(service.validateMessage(emptyMessage)).rejects.toThrow(BadRequestException);
      expect(mockRabbitMQMessageService.sendValidationFailure).toHaveBeenCalledWith(
        emptyMessage,
        expect.any(Array),
        expect.any(String),
      );
    });

    it('should handle non-object message types', async () => {
      const nonObjectMessages = ['string message', 123, true, [1, 2, 3]];

      for (const message of nonObjectMessages) {
        await expect(service.validateMessage(message)).rejects.toThrow(BadRequestException);
        expect(mockRabbitMQMessageService.sendValidationFailure).toHaveBeenCalledWith(
          message,
          expect.any(Array),
          expect.any(String),
        );
      }
    });

    it('should validate and transform message to AgentMessageDto', async () => {
      const messageData = {
        id: 'msg-123',
        senderId: 'agent-1',
        recipientId: 'agent-2',
        timestamp: new Date().toISOString(),
        type: 'TEST_MESSAGE',
        payload: 'test payload',
        extraField: 'should be ignored',
      };

      const result = await service.validateMessage(messageData);

      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty('id', messageData.id);
      expect(result).toHaveProperty('senderId', messageData.senderId);
      expect(result).toHaveProperty('recipientId', messageData.recipientId);
      expect(result).toHaveProperty('timestamp', messageData.timestamp);
      expect(result).toHaveProperty('type', messageData.type);
      expect(result).toHaveProperty('payload', messageData.payload);
      expect(result).not.toHaveProperty('extraField');
    });
  });
});
