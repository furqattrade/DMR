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
  authentication_certificate: string;

  @IsString()
  @IsOptional()
  created_at: string;

  @IsString()
  @IsOptional()
  updated_at: string;

  @IsBoolean()
  @IsOptional()
  deleted?: boolean;
}
