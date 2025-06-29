import {
  ExternalServiceMessageDto,
  MessageType,
  ValidationErrorDto,
  ValidationErrorType,
} from '@dmr/shared';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

@Injectable()
export class MessageValidatorService {
  private readonly logger = new Logger(MessageValidatorService.name);

  async validateExternalServiceMessage(messageData: unknown): Promise<ExternalServiceMessageDto> {
    if (!this.isValidObject(messageData)) {
      throw this.createValidationException(
        'Invalid message format: expected object',
        [{ type: ValidationErrorType.INVALID_FORMAT, message: 'Message must be a valid object' }],
        messageData,
      );
    }

    try {
      const message = plainToInstance(ExternalServiceMessageDto, messageData);
      const errors = await validate(message);

      if (errors.length > 0) {
        const validationErrors = this.mapValidationErrors(errors);
        this.logger.error(`Message validation failed: ${JSON.stringify(validationErrors)}`);
        throw this.createValidationException(
          'Message validation failed',
          validationErrors,
          messageData,
        );
      }

      this.validateMessageType(message.type, messageData);
      this.logger.log(`Message ${message.id} validated successfully with type ${message.type}`);

      return message;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw this.createValidationException(
        'Message validation failed due to unexpected error',
        [
          {
            type: ValidationErrorType.UNKNOWN,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
        messageData,
      );
    }
  }

  private isValidObject(data: unknown): data is Record<string, unknown> {
    return data !== null && data !== undefined && typeof data === 'object' && !Array.isArray(data);
  }

  private validateMessageType(type: MessageType, originalMessage: unknown): void {
    if (!Object.values(MessageType).includes(type)) {
      throw this.createValidationException(
        `Unsupported message type: ${type}`,
        [
          {
            type: ValidationErrorType.INVALID_MESSAGE_TYPE,
            message: `Message type '${type}' is not supported. Currently only 'ChatMessage' is supported.`,
          },
        ],
        originalMessage,
      );
    }
  }

  private createValidationException(
    message: string,
    validationErrors: ValidationErrorDto[],
    originalMessage: unknown,
  ): BadRequestException {
    return new BadRequestException({
      message,
      validationErrors,
      originalMessage,
    });
  }

  private mapValidationErrors(errors: ValidationError[], prefix = ''): ValidationErrorDto[] {
    const validationErrors: ValidationErrorDto[] = [];

    for (const error of errors) {
      const property = prefix ? `${prefix}.${error.property}` : error.property;

      if (error.constraints) {
        validationErrors.push(
          ...Object.values(error.constraints).map((constraint) => ({
            type: ValidationErrorType.INVALID_FORMAT,
            message: `${property}: ${constraint}`,
          })),
        );
      }

      if (error.children?.length) {
        validationErrors.push(...this.mapValidationErrors(error.children, property));
      }
    }

    return validationErrors;
  }
}
