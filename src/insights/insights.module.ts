import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  imports: [HttpModule], // Wajib ditambahkan agar HttpService bisa digunakan
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
