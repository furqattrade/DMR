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

  async validateMessage(
    messageData: unknown,
    receivedAt = new Date().toISOString(),
  ): Promise<{ message: AgentMessageDto; validationErrors?: ValidationErrorDto[] }> {
    const validationErrors: ValidationErrorDto[] = [];

    // Check if message is an object
    this.validateObjectStructure(messageData, validationErrors, receivedAt);

    try {
      // Validate against DTO schema
      const message = plainToInstance(AgentMessageDto, messageData);
      await this.validateMessageFormat(message, messageData, validationErrors, receivedAt);
      this.validateMessageTimestamp(message, messageData, validationErrors, receivedAt);
      this.validateMessageType(message, messageData, validationErrors, receivedAt);

      // Validate sender and recipient
      await this.validateMessageParticipants(message, messageData, validationErrors, receivedAt);

      // Message is valid
      return { message };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For unexpected errors
      validationErrors.push(
        this.createValidationError(
          ValidationErrorType.UNKNOWN,
          `Unexpected validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
        ),
      );

      this.logger.error(
        `Message validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
      );

      throw new BadRequestException({
        message: 'Message validation failed',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private validateObjectStructure(
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): void {
    if (!this.isValidObject(messageData)) {
      validationErrors.push(
        this.createValidationError(ValidationErrorType.INVALID_OBJECT, 'Message must be an object'),
      );

      throw new BadRequestException({
        message: 'Message must be a valid object',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private async validateMessageFormat(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<void> {
    const errors = await validate(message);
    if (errors.length > 0) {
      this.addFormatErrorsToValidationErrors(errors, validationErrors);
      throw new BadRequestException({
        message: 'Validation failed',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private validateMessageTimestamp(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): void {
    if (message.timestamp && !this.isValidISODateString(message.timestamp)) {
      validationErrors.push(
        this.createValidationError(
          ValidationErrorType.INVALID_TIMESTAMP,
          'Invalid timestamp format',
        ),
      );

      throw new BadRequestException({
        message: 'Invalid timestamp format',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private validateMessageType(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): void {
    if (!Object.values(MessageType).includes(message.type)) {
      const errorMessage = `Invalid message type: ${message.type}`;
      validationErrors.push(
        this.createValidationError(ValidationErrorType.INVALID_FORMAT, errorMessage),
      );

      throw new BadRequestException({
        message: errorMessage,
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private async validateMessageParticipants(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<void> {
    try {
      await this.validateAgentExists(message.senderId, 'Sender');
    } catch (senderError) {
      if (senderError instanceof BadRequestException) {
        validationErrors.push(
          this.createValidationError(ValidationErrorType.INVALID_SENDER_ID, senderError.message),
        );
        throw new BadRequestException({
          message: senderError.message,
          validationErrors,
          originalMessage: messageData,
          receivedAt,
        });
      }
      throw senderError;
    }

    try {
      await this.validateAgentExists(message.recipientId, 'Recipient');
    } catch (recipientError) {
      if (recipientError instanceof BadRequestException) {
        validationErrors.push(
          this.createValidationError(
            ValidationErrorType.INVALID_RECIPIENT_ID,
            recipientError.message,
          ),
        );
        throw new BadRequestException({
          message: recipientError.message,
          validationErrors,
          originalMessage: messageData,
          receivedAt,
        });
      }
      throw recipientError;
    }
  }

  private isValidObject(data: unknown): boolean {
    return data !== null && typeof data === 'object' && !Array.isArray(data);
  }

  private addFormatErrorsToValidationErrors(
    errors: ValidationError[],
    validationErrors: ValidationErrorDto[],
  ): void {
    for (const error of errors) {
      if (!error || typeof error !== 'object') continue;

      // Type guard to ensure error has constraints property
      if (!error || typeof error !== 'object' || !('constraints' in error)) continue;

      // Additional type guard for constraints property
      const constraints = error.constraints;
      if (!constraints || typeof constraints !== 'object') continue;

      const errorConstraints = constraints as Record<string, string>;

      for (const constraint in errorConstraints) {
        if (Object.prototype.hasOwnProperty.call(errorConstraints, constraint)) {
          validationErrors.push(
            this.createValidationError(
              ValidationErrorType.INVALID_FORMAT,
              errorConstraints[constraint],
            ),
          );
        }
      }
    }
  }

  createValidationError(type: ValidationErrorType, message: string): ValidationErrorDto {
    return {
      type,
      message,
    };
  }

  private isValidISODateString(dateString: string): boolean {
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
      throw new BadRequestException(`Failed to validate ${agentType.toLowerCase()} agent`);
    }
  }
}
