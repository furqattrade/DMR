import {
  AgentMessageDto,
  ValidationErrorDto,
  ValidationErrorType,
  ValidationFailureMessageDto,
} from '@dmr/shared';
import { Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';

@Injectable()
export class RabbitMQMessageService {
  private readonly logger = new Logger(RabbitMQMessageService.name);
  private readonly VALIDATION_FAILURES_QUEUE = 'validation-failures';

  constructor(private readonly rabbitMQService: RabbitMQService) {
    void this.setupValidationFailuresQueue();
  }

  private async setupValidationFailuresQueue(): Promise<void> {
    try {
      const success = await this.rabbitMQService.setupQueue(this.VALIDATION_FAILURES_QUEUE);
      if (success) {
        this.logger.log(
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' set up successfully`,
        );
      } else {
        this.logger.error(
          `Failed to set up validation failures queue '${this.VALIDATION_FAILURES_QUEUE}'`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error setting up validation failures queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendValidMessage(message: AgentMessageDto, receivedAt: string): Promise<boolean> {
    try {
      const queueName = message.recipientId;
      const channel = this.rabbitMQService.channel;
      const queueExists = await this.rabbitMQService.checkQueue(queueName);
      if (!queueExists) {
        const success = await this.rabbitMQService.setupQueue(queueName);
        if (!success) {
          this.logger.error(`Failed to create queue for recipient ${queueName}`);
          return false;
        }
      }

      const enrichedMessage = {
        ...message,
        receivedAt,
      };

      const success = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(enrichedMessage)), {
        persistent: true,
      });

      if (success) {
        this.logger.log(`Message ${message.id} sent to queue ${queueName}`);
      } else {
        this.logger.warn(`Failed to send message ${message.id} to queue ${queueName}`);
      }

      return success;
    } catch (error) {
      this.logger.error(
        `Error sending valid message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  private getPropertySafely<T>(object: unknown, key: string, defaultValue: T): T {
    if (typeof object === 'object' && object !== null && key in object) {
      const value = (object as Record<string, unknown>)[key];
      return value !== undefined ? (value as T) : defaultValue;
    }
    return defaultValue;
  }

  sendValidationFailure(
    originalMessage: unknown,
    errors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<boolean> {
    try {
      const channel = this.rabbitMQService.channel;
      const isValidObject = typeof originalMessage === 'object' && originalMessage !== null;
      const messageId = this.getPropertySafely(originalMessage, 'id', crypto.randomUUID());

      // Create a validation failure message
      const failureMessage: ValidationFailureMessageDto = {
        // Try to preserve original message fields if possible
        id: String(messageId),
        timestamp: this.getPropertySafely(originalMessage, 'timestamp', new Date().toISOString()),
        senderId: this.getPropertySafely(originalMessage, 'senderId', 'unknown'),
        recipientId: this.getPropertySafely(originalMessage, 'recipientId', 'unknown'),
        payload: isValidObject
          ? this.getPropertySafely(originalMessage, 'payload', JSON.stringify(originalMessage))
          : JSON.stringify(originalMessage),
        type: this.getPropertySafely<string | undefined>(originalMessage, 'type', undefined),

        // Add validation failure specific fields
        receivedAt,
        errors,
        originalMessageId: isValidObject ? String(messageId) : undefined,
      };

      // Send message with persistent flag
      const success = channel.sendToQueue(
        this.VALIDATION_FAILURES_QUEUE,
        Buffer.from(JSON.stringify(failureMessage)),
        { persistent: true },
      );

      if (success) {
        this.logger.log(
          `Validation failure message sent to queue ${this.VALIDATION_FAILURES_QUEUE}`,
        );
      } else {
        this.logger.warn(
          `Failed to send validation failure message to queue ${this.VALIDATION_FAILURES_QUEUE}`,
        );
      }

      return success;
    } catch (error) {
      this.logger.error(
        `Error sending validation failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  createValidationError(type: ValidationErrorType, message: string): ValidationErrorDto {
    return {
      type,
      message,
    };
  }
}
