import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IAgent } from '../interfaces/agent.interface';

export class AgentDto implements IAgent {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  authenticationCertificate?: string;

  @IsString()
  @IsOptional()
  createdAt?: string;

  @IsString()
  @IsOptional()
  updatedAt?: string;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}
