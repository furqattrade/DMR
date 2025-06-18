import { BadRequestException, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AgentEventNames, ValidationErrorDto } from '@dmr/shared';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq/rabbitmq.service';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';
import { MessageValidatorService } from './message-validator.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from '../centops/centops.service';
import { AgentEventNames, CentOpsEvent } from '@dmr/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';

@WebSocketGateway({
  connectionStateRecovery: {
    maxDisconnectionDuration: Number(process.env.WEB_SOCKET_MAX_DISCONNECTION_DURATION || '120000'),
    skipMiddlewares: true,
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly rabbitService: RabbitMQService,
    private readonly messageValidator: MessageValidatorService,
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly centOpsService: CentOpsService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token: string = (client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

      const jwtPayload = await this.authService.verifyToken(token);

      const consume = await this.rabbitService.subscribe(jwtPayload.sub);

      if (!consume) {
        client.disconnect();
      }

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      Object.assign(client, { agent: jwtPayload });
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    const agentId = client?.agent?.sub;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @SubscribeMessage(AgentEventNames.MESSAGE_TO_DMR_SERVER)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<void> {
    const receivedAt = new Date().toISOString();
    try {
      const result = await this.messageValidator.validateMessage(data, receivedAt);
      await this.handleValidMessage(result, receivedAt);
    } catch (error: unknown) {
      await this.handleMessageError(error);
    }
  }

  private async handleValidMessage(
    result:
      | { message: AgentMessageDto; validationErrors?: ValidationErrorDto[] }
      | null
      | undefined,
    receivedAt: string,
  ): Promise<void> {
    // Ensure result and message exist before proceeding
    if (!result || !result.message) {
      throw new Error('Validation succeeded but no message was returned');
    }

    // Use type assertion to ensure TypeScript knows this is an AgentMessageDto
    const validatedMessage: AgentMessageDto = result.message;
    await this.rabbitMQMessageService.sendValidMessage(validatedMessage, receivedAt);
    this.logger.log(
      `Received valid message from agent ${validatedMessage.senderId} to ${validatedMessage.recipientId} (ID: ${validatedMessage.id})`,
    );
  }

  private async handleMessageError(error: unknown): Promise<void> {
    // Handle validation failures
    if (error instanceof BadRequestException) {
      const errorData = error.getResponse() as {
        message: string;
        validationErrors?: ValidationErrorDto[];
        originalMessage?: unknown;
        receivedAt?: string;
      };

      // Send validation failure to the queue
      if (
        errorData &&
        typeof errorData === 'object' &&
        errorData.validationErrors &&
        Array.isArray(errorData.validationErrors) &&
        errorData.originalMessage !== undefined &&
        typeof errorData.receivedAt === 'string'
      ) {
        await this.rabbitMQMessageService.sendValidationFailure(
          errorData.originalMessage,
          errorData.validationErrors,
          errorData.receivedAt,
        );
      }

      this.logger.warn(
        `Invalid message received: ${typeof errorData.message === 'string' ? errorData.message : 'Validation error'}`,
      );
    } else {
      // Handle unexpected errors
      this.logger.error(
        `Unexpected error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
