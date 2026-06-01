import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import Groq from 'groq-sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatService {
  private groq: Groq;

  constructor(private configService: ConfigService) {
    this.groq = new Groq({
      apiKey: this.configService.get<string>('GROQ_API_KEY') || 'mock-api-key',
    });
  }

  async getChatResponse(message: string): Promise<string> {
    try {
      const response = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are OmniSight AI, a helpful business intelligence assistant. 
                      You have access to a database with the following schema:
                      - User (id, email, name, role)
                      - Transaction (id, invoiceDate, customerId, productId, category, quantity, unitPrice, totalSales, status)
                      - Alert (id, type, title, description, severity, status)
                      Answer the user's BI-related questions concisely and professionally. If they ask about predictions, inform them that you use advanced PJK-GM017 and Random Forest models.`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        model: 'llama-3.3-70b-versatile',
      });

      return response.choices[0]?.message?.content || 'I encountered an error processing your request.';
    } catch (error) {
      console.error('Groq API Error:', error);
      throw new HttpException('Failed to generate response from AI Service.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
