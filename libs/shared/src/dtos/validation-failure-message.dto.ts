import { IsArray, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ValidationErrorType } from '../enums';
import { AgentMessageDto } from './agent-message.dto';

export class ValidationErrorDto {
  @IsString()
  @IsNotEmpty()
  type: ValidationErrorType;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class ValidationFailureMessageDto extends AgentMessageDto {
  @IsString()
  @IsNotEmpty()
  receivedAt: string;

  @IsArray()
  @IsNotEmpty()
  errors: ValidationErrorDto[];

  @IsString()
  @IsUUID()
  originalMessageId?: string;
}
