import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [HttpModule], // Wajib ditambahkan agar HttpService bisa digunakan
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
