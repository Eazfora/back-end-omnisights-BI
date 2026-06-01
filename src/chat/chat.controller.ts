import { Controller, Post, Body } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async getResponse(@Body('message') message: string) {
    if (!message) {
      return { reply: "Please provide a message." };
    }
    const response = await this.chatService.getChatResponse(message);
    return { reply: response };
  }
}
