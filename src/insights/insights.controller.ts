/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  Get,
} from '@nestjs/common';
import { InsightsService } from './insights.service';
import { PredictChurnDto } from './dto/predict-churn.dto';
import { PredictForecastDto } from './dto/predict-forecast.dto';

@Controller('api/insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('risk-analysis') // <--- Ini yang mendaftarkan akhiran /risk-analysis
  async getRiskAnalysis() {
    // Memanggil fungsi AI yang baru saja kita buat di Service
    return await this.insightsService.getCustomerInsights();
  }

  //! ENDPOINT 1: CUSTOMER CHURN PREDICTION
  @Post('churn-prediction')
  @UsePipes(new ValidationPipe({ transform: true }))
  async predictChurn(@Body() body: PredictChurnDto) {
    const result = await this.insightsService.getChurnPrediction(
      body.recency,
      body.frequency,
      body.monetary,
    );

    return {
      message: 'Prediksi Churn berhasil diambil dari model AI',
      data: result,
    };
  }

  //! ENDPOINT 2: AI SALES FORECASTING
  @Post('sales-forecast')
  @UsePipes(new ValidationPipe({ transform: true }))
  async predictForecast(@Body() body: PredictForecastDto) {
    const result = await this.insightsService.getSalesForecast(
      body.Bulan_Kedepan,
    );

    return {
      message: 'Peramalan penjualan berhasil dihitung',
      data: result,
    };
  }
}
