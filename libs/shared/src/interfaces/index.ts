import { IsString, IsUUID, IsDateString } from 'class-validator';

export class AgentConfiguration {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsString()
  authenticationCertificate: string;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;
}
