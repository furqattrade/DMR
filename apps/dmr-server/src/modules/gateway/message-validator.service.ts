import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AgentMessageDto, MessageType, ValidationErrorDto, ValidationErrorType } from '@dmr/shared';
import { CentOpsService } from '../centops/centops.service';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';

@Injectable()
export class MessageValidatorService {
  private readonly logger = new Logger(MessageValidatorService.name);
  private readonly UNKNOWN_ERROR = 'Unknown error';

  constructor(
    private readonly centOpsService: CentOpsService,
    private readonly rabbitMQMessageService: RabbitMQMessageService,
  ) {}

  async validateMessage(messageData: unknown): Promise<AgentMessageDto> {
    const receivedAt = new Date().toISOString();
    const validationErrors: ValidationErrorDto[] = [];

    try {
      const message = plainToInstance(AgentMessageDto, messageData as Record<string, unknown>);
      const errors = await validate(message);

      //checks message format
      if (errors.length > 0) {
        errors.forEach((error) => {
          const constraints = Object.values(error.constraints || {}).join(', ');
          validationErrors.push(
            this.rabbitMQMessageService.createValidationError(
              ValidationErrorType.INVALID_FORMAT,
              `${error.property}: ${constraints}`,
            ),
          );
        });

        const errorMessages = errors
          .map((error) => Object.values(error.constraints || {}).join(', '))
          .join('; ');

        this.logger.warn(`Message validation failed: ${errorMessages}`);

        await this.rabbitMQMessageService.sendValidationFailure(
          messageData,
          validationErrors,
          receivedAt,
        );

        throw new BadRequestException(`Invalid message format: ${errorMessages}`);
      }

      //checks message type
      if (!Object.values(MessageType).includes(message.type)) {
        validationErrors.push(
          this.rabbitMQMessageService.createValidationError(
            ValidationErrorType.INVALID_MESSAGE_TYPE,
            `Invalid message type: ${message.type}`,
          ),
        );

        await this.rabbitMQMessageService.sendValidationFailure(
          messageData,
          validationErrors,
          receivedAt,
        );

        throw new BadRequestException(`Invalid message type: ${message.type}`);
      }

      //checks timestamp format
      if (!this.isValidISOString(message.timestamp)) {
        validationErrors.push(
          this.rabbitMQMessageService.createValidationError(
            ValidationErrorType.INVALID_TIMESTAMP,
            'Invalid timestamp format',
          ),
        );

        await this.rabbitMQMessageService.sendValidationFailure(
          messageData,
          validationErrors,
          receivedAt,
        );

        throw new BadRequestException('Invalid timestamp format');
      }

      try {
        // Validate that sender and recipient exist in the agent list
        await this.validateAgentExists(message.senderId, 'Sender');
        await this.validateAgentExists(message.recipientId, 'Recipient');

        // message is valid - send to the recipient's queue
        await this.rabbitMQMessageService.sendValidMessage(message, receivedAt);

        return message;
      } catch (agentError) {
        if (agentError instanceof BadRequestException) {
          validationErrors.push(
            this.rabbitMQMessageService.createValidationError(
              ValidationErrorType.INVALID_AGENT,
              agentError.message,
            ),
          );

          await this.rabbitMQMessageService.sendValidationFailure(
            messageData,
            validationErrors,
            receivedAt,
          );

          throw agentError;
        }
        throw agentError;
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For unexpected errors
      validationErrors.push(
        this.rabbitMQMessageService.createValidationError(
          ValidationErrorType.UNKNOWN,
          `Unexpected validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
        ),
      );

      await this.rabbitMQMessageService.sendValidationFailure(
        messageData,
        validationErrors,
        receivedAt,
      );

      this.logger.error(
        `Message validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
      );
      throw new BadRequestException('Message validation failed');
    }
  }

  private isValidISOString(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime()) && date.toISOString() === dateString;
    } catch {
      return false;
    }
  }

  private async validateAgentExists(agentId: string, agentType: string): Promise<void> {
    try {
      try {
        await this.centOpsService.getCentOpsConfigurationByClientId(agentId);
        return;
      } catch {
        throw new BadRequestException(`${agentType} agent with ID ${agentId} not found`);
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error validating agent existence: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
      );
      throw new BadRequestException(`Failed to validate ${agentType.toLowerCase()} agent`);
    }
  }
}
