import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { RabbitMQMessageService } from './rabbitmq-message.service';
import { RabbitMQService } from './rabbitmq.service';
import { RABBITMQ_CONFIG_TOKEN } from '../../common/config';
import { ValidationErrorType } from '@dmr/shared';

// Mock crypto for consistent UUID generation in tests
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mocked-uuid'),
}));

describe('RabbitMQMessageService', () => {
  let service: RabbitMQMessageService;
  let rabbitMQService: RabbitMQService;
  let channelMock: any;

  const mockConfig = {
    validationFailuresTTL: 86400000, // 24 hours
  };

  beforeEach(async () => {
    // Create channel mock with all required methods
    channelMock = {
      sendToQueue: vi.fn().mockReturnValue(true),
    };

    // Create RabbitMQService mock
    const rabbitMQServiceMock = {
      channel: channelMock,
      checkQueue: vi.fn().mockResolvedValue(true),
      setupQueue: vi.fn().mockResolvedValue(true),
    };

    // Mock Logger to prevent console output during tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQMessageService,
        {
          provide: RabbitMQService,
          useValue: rabbitMQServiceMock,
        },
        {
          provide: RABBITMQ_CONFIG_TOKEN,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<RabbitMQMessageService>(RabbitMQMessageService);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setupValidationFailuresQueue', () => {
    it('should log success when validation failures queue exists', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      // Call the private method using type assertion
      await (service as any).setupValidationFailuresQueue();

      expect(rabbitMQService.checkQueue).toHaveBeenCalledWith('validation-failures');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Validation failures queue 'validation-failures' exists"),
      );
    });

    it('should throw error when validation failures queue does not exist', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);
      const errorSpy = vi.spyOn(Logger.prototype, 'error');

      await expect((service as any).setupValidationFailuresQueue()).rejects.toThrow(
        expect.stringContaining("Validation failures queue 'validation-failures' not found"),
      );

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle errors when checking queue', async () => {
      const testError = new Error('Test error');
      vi.spyOn(rabbitMQService, 'checkQueue').mockRejectedValueOnce(testError);
      const errorSpy = vi.spyOn(Logger.prototype, 'error');

      await (service as any).setupValidationFailuresQueue();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error checking validation failures queue: Test error'),
      );
    });
  });

  describe('sendValidMessage', () => {
    const mockMessage = {
      id: 'test-message-id',
      senderId: 'sender-123',
      recipientId: 'recipient-456',
      type: 'TEST',
      timestamp: '2023-01-01T12:00:00.000Z',
      content: { test: 'data' },
    };
    const mockReceivedAt = '2023-01-01T12:00:05.000Z';

    it('should send a valid message to the recipient queue', async () => {
      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(true);
      expect(rabbitMQService.checkQueue).toHaveBeenCalledWith(mockMessage.recipientId);
      expect(channelMock.sendToQueue).toHaveBeenCalledWith(
        mockMessage.recipientId,
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );

      // Verify the message content
      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage).toEqual({
        ...mockMessage,
        receivedAt: mockReceivedAt,
      });
    });

    it('should create queue if it does not exist', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(true);
      expect(rabbitMQService.setupQueue).toHaveBeenCalledWith(mockMessage.recipientId);
      expect(channelMock.sendToQueue).toHaveBeenCalled();
    });

    it('should return false if queue creation fails', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);
      vi.spyOn(rabbitMQService, 'setupQueue').mockResolvedValueOnce(false);

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
      expect(channelMock.sendToQueue).not.toHaveBeenCalled();
    });

    it('should handle errors and return false', async () => {
      channelMock.sendToQueue.mockImplementationOnce(() => {
        throw new Error('Send error');
      });

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
    });

    it('should log warning when sendToQueue returns false', async () => {
      channelMock.sendToQueue.mockReturnValueOnce(false);
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to send message ${mockMessage.id}`),
      );
    });
  });

  describe('sendValidationFailure', () => {
    const mockErrors = [{ type: ValidationErrorType.INVALID_FORMAT, message: 'Invalid format' }];
    const mockReceivedAt = '2023-01-01T12:00:05.000Z';

    it('should send validation failure with message ID from original message', async () => {
      const originalMessage = { id: 'original-id', content: 'test' };

      const result = await service.sendValidationFailure(
        originalMessage,
        mockErrors,
        mockReceivedAt,
      );

      expect(result).toBe(true);
      expect(channelMock.sendToQueue).toHaveBeenCalledWith(
        'validation-failures',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );

      // Verify the failure message content
      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage).toEqual({
        id: 'original-id',
        errors: mockErrors,
        receivedAt: mockReceivedAt,
        message: originalMessage,
      });
    });

    it('should generate UUID when original message has no ID', async () => {
      const originalMessage = { content: 'test-no-id' };

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
    });

    it('should generate UUID when original message ID is invalid', async () => {
      const originalMessage = { id: null, content: 'test-invalid-id' };

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
    });

    it('should generate UUID when original message is not an object', async () => {
      const originalMessage = 'string-message';

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
      expect(sentMessage.message).toBe('string-message');
    });

    it('should handle errors and return false', async () => {
      channelMock.sendToQueue.mockImplementationOnce(() => {
        throw new Error('Send error');
      });

      const result = await service.sendValidationFailure({}, mockErrors, mockReceivedAt);

      expect(result).toBe(false);
    });

    it('should log warning when sendToQueue returns false', async () => {
      channelMock.sendToQueue.mockReturnValueOnce(false);
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      const result = await service.sendValidationFailure({}, mockErrors, mockReceivedAt);

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send validation failure message'),
      );
    });
  });

  // Tests for createValidationError removed as the method has been moved to MessageValidatorService

  describe('getPropertySafely', () => {
    it('should return property value when it exists', () => {
      const obj = { test: 'value' };

      const result = (service as any).getPropertySafely(obj, 'test', 'default');

      expect(result).toBe('value');
    });

    it('should return default value when property does not exist', () => {
      const obj = { other: 'value' };

      const result = (service as any).getPropertySafely(obj, 'test', 'default');

      expect(result).toBe('default');
    });

    it('should return default value when input is not an object', () => {
      const result = (service as any).getPropertySafely('string', 'test', 'default');

      expect(result).toBe('default');
    });

    it('should return default value when input is null', () => {
      const result = (service as any).getPropertySafely(null, 'test', 'default');

      expect(result).toBe('default');
    });
  });
});
