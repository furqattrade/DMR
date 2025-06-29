import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { WebsocketModule } from '../websocket/websocket.module';
import { MessageValidatorService } from './message-validator.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [MessagesController],
  imports: [WebsocketModule, HttpModule],
  providers: [MessagesService, MessageValidatorService],
  exports: [MessagesService],
})
export class MessagesModule {}
