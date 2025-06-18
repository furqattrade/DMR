import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AgentMessageDto, ValidationErrorDto } from '@dmr/shared';
import { SimpleValidationFailureMessage } from '@dmr/shared/interfaces';
import { RabbitMQService } from './rabbitmq.service';
import { RABBITMQ_CONFIG_TOKEN, rabbitmqConfig } from '../../common/config';

@Injectable()
export class RabbitMQMessageService {
  private readonly logger = new Logger(RabbitMQMessageService.name);
  private readonly VALIDATION_FAILURES_QUEUE = 'validation-failures';
  private readonly VALIDATION_FAILURES_TTL: number;
  private readonly UNKNOWN_ERROR = 'Unknown error';

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    @Inject(RABBITMQ_CONFIG_TOKEN)
    private readonly config: ConfigType<typeof rabbitmqConfig>,
  ) {
    // Get TTL from environment variable or use default (24 hours)
    // Using type assertion to fix the lint error about unsafe assignment
    this.VALIDATION_FAILURES_TTL = (
      this.config as { validationFailuresTTL: number }
    ).validationFailuresTTL;
    void this.setupValidationFailuresQueue();
  }

  private async setupValidationFailuresQueue(): Promise<void> {
    try {
      // Check if the validation failures queue exists (should be created via init-rabbit.sh)
      const queueExists = await this.rabbitMQService.checkQueue(this.VALIDATION_FAILURES_QUEUE);

      if (queueExists) {
        this.logger.log(
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' exists and is ready to use`,
        );
      } else {
        const errorMessage =
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' not found. ` +
          'This queue should be created during RabbitMQ initialization.';

        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error checking validation failures queue: ${errorMessage}`);
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
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error sending valid message: ${errorMessage}`);
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

      let messageId: string;

      try {
        if (
          typeof originalMessage === 'object' &&
          originalMessage !== null &&
          'id' in originalMessage
        ) {
          const messageWithId = originalMessage as { id?: unknown };

          if (
            messageWithId.id !== undefined &&
            messageWithId.id !== null &&
            (typeof messageWithId.id === 'string' || typeof messageWithId.id === 'number')
          ) {
            messageId = String(messageWithId.id);
          } else {
            messageId = crypto.randomUUID();
          }
        } else {
          messageId = crypto.randomUUID();
        }
      } catch {
        messageId = crypto.randomUUID();
        this.logger.debug('Error extracting original message ID, using generated UUID instead');
      }

      const failureMessage: SimpleValidationFailureMessage = {
        id: messageId,
        errors,
        receivedAt,
        message: originalMessage,
      };

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
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error sending validation failure: ${errorMessage}`);
      return false;
    }
  }
}
