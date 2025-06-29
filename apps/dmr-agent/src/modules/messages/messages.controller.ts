import { Body, Controller, HttpCode, HttpStatus, Post, UseInterceptors } from '@nestjs/common';
import { TimeoutInterceptor } from '../../common/interceptors/timeout.interceptor';
import { MessageValidatorService } from './message-validator.service';
import { MessagesService } from './messages.service';

@Controller({ path: 'messages', version: '1' })
@UseInterceptors(TimeoutInterceptor)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messageValidatorService: MessageValidatorService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() data: unknown): Promise<void> {
    const validatedMessage =
      await this.messageValidatorService.validateExternalServiceMessage(data);
    return this.messagesService.sendEncryptedMessageToServer(validatedMessage);
  }
}
