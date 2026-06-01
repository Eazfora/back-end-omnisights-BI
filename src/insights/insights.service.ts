/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class InsightsService {
  private readonly pythonApiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.pythonApiBaseUrl =
      this.configService.get<string>('PYTHON_API_URL') ||
      'http://localhost:8000';
  }

  //! FITUR 1: CUSTOMER CHURN PREDICTION
  async getChurnPrediction(
    recency: number,
    frequency: number,
    monetary: number,
  ) {
    const url = `${this.pythonApiBaseUrl}/predict-churn`;
    const payload = {
      Recency: recency,
      Frequency: frequency,
      Monetary: monetary,
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post<any>(url, payload),
      );
      return response.data;
    } catch (error: any) {
      console.error('Gagal menghubungi Model Churn Python:', error.message);
      throw new InternalServerErrorException(
        'Layanan Prediksi Churn AI sedang tidak tersedia',
      );
    }
  }

  //! FITUR 2: AI SALES FORECASTING
  async getSalesForecast(bulanKedepan: number) {
    const url = `${this.pythonApiBaseUrl}/sales-forecast`;
    const payload = {
      Bulan_Kedepan: bulanKedepan,
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post<any>(url, payload),
      );
      return response.data;
    } catch (error: any) {
      console.error('Gagal menghubungi Model Forecast Python:', error.message);
      throw new InternalServerErrorException(
        'Layanan AI Forecasting sedang tidak tersedia',
      );
    }
  }
}
