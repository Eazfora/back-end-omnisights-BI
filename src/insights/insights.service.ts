/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Injectable,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InsightsService {
  private readonly pythonApiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService, // <--- Prisma sudah dimasukkan
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.pythonApiBaseUrl =
      this.configService.get<string>('PYTHON_API_URL') ||
      'http://localhost:8000';
  }

  //! FITUR 1: CUSTOMER CHURN PREDICTION (Wawasan Pelanggan)
  async getCustomerInsights() {
    try {
      // 1. Ambil transaksi dari database
      const transactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
      });

      // 2. Hitung Metrik RFM per Pelanggan
      const customerData = {};
      const today = new Date();

      transactions.forEach((tx) => {
        const cId = tx.customerId;
        const txDate = new Date(tx.invoiceDate);

        if (!customerData[cId]) {
          customerData[cId] = {
            lastPurchase: txDate,
            Frequency: 0,
            Monetary: 0,
          };
        }

        if (txDate > customerData[cId].lastPurchase) {
          customerData[cId].lastPurchase = txDate;
        }

        customerData[cId].Frequency += 1;
        customerData[cId].Monetary += tx.totalSales;
      });

      const atRiskCustomers = [];
      let totalLTV = 0;
      let totalChurnProbability = 0;
      const totalCustomersCount = Object.keys(customerData).length;

      // 3. Tembak ke API Python untuk Minta Prediksi
      for (const customerId in customerData) {
        const data = customerData[customerId];

        totalLTV += data.Monetary;

        const diffTime = Math.abs(
          today.getTime() - data.lastPurchase.getTime(),
        );
        const recencyDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const payload = {
          Recency: recencyDays,
          Frequency: data.Frequency,
          Monetary: data.Monetary,
        };

        try {
          const response = await lastValueFrom(
            this.httpService.post(
              `${this.pythonApiBaseUrl}/predict-churn`,
              payload,
            ),
          );

          const aiData = response.data.prediction || response.data;

          const probValue = parseFloat(
            aiData.probability_percentage || aiData.Probability || 0,
          );
          totalChurnProbability += probValue;

          const isRisk =
            aiData.churn_risk_flag === 1 || aiData.Churn_Risk === 1;
          if (isRisk) {
            atRiskCustomers.push({
              customerId: customerId,
              lastActive: data.lastPurchase.toISOString().split('T')[0],
              ltv: data.Monetary,
              probability: `${probValue.toFixed(1)}%`,
              segment: aiData.status_message || aiData.Segment || 'At Risk',
            });
          }
        } catch (aiError: any) {
          console.error(
            `Gagal hitung prediksi untuk ${customerId}:`,
            aiError.message,
          );
        }
      }

      atRiskCustomers.sort((a, b) => b.ltv - a.ltv);

      const avgLTV =
        totalCustomersCount > 0 ? totalLTV / totalCustomersCount : 0;
      const avgChurnRate =
        totalCustomersCount > 0
          ? totalChurnProbability / totalCustomersCount
          : 0;
      const activeUsers = totalCustomersCount - atRiskCustomers.length;

      // =================================================================
      // 5. MESIN TREN DINAMIS (REAL-TIME DARI DATABASE)
      // =================================================================
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'Mei',
        'Jun',
        'Jul',
        'Ags',
        'Sep',
        'Okt',
        'Nov',
        'Des',
      ];

      const monthlyActiveUsers = new Map<number, Set<string>>();
      transactions.forEach((tx) => {
        const txMonth = new Date(tx.invoiceDate).getMonth();
        if (!monthlyActiveUsers.has(txMonth)) {
          monthlyActiveUsers.set(txMonth, new Set());
        }
        monthlyActiveUsers.get(txMonth).add(tx.customerId);
      });

      const currentMonth = new Date().getMonth();
      const dynamicChurnTrend = [];

      for (let i = 5; i >= 0; i--) {
        let targetMonth = currentMonth - i;
        if (targetMonth < 0) targetMonth += 12;

        const activeInMonth = monthlyActiveUsers.get(targetMonth)?.size || 0;
        const historicalChurn =
          totalCustomersCount > 0
            ? Math.max(
                0,
                ((totalCustomersCount - activeInMonth) / totalCustomersCount) *
                  100,
              )
            : 0;

        dynamicChurnTrend.push({
          month: monthNames[targetMonth],
          rate: parseFloat(historicalChurn.toFixed(1)),
        });
      }

      for (let i = 1; i <= 3; i++) {
        let futureMonth = currentMonth + i;
        if (futureMonth > 11) futureMonth -= 12;

        dynamicChurnTrend.push({
          month: monthNames[futureMonth],
          rate: parseFloat((avgChurnRate + i * 0.2).toFixed(1)),
        });
      }

      // 6. KEMBALIKAN DATANYA
      return {
        summary: {
          totalSegments: totalCustomersCount,
          activeUsers: activeUsers,
          avgChurnRate: avgChurnRate,
          avgLTV: avgLTV,
        },
        totalAtRisk: atRiskCustomers.length,
        riskList: atRiskCustomers,
        churnTrend: dynamicChurnTrend,
      };
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Gagal mengambil wawasan pelanggan',
        HttpStatus.INTERNAL_SERVER_ERROR,
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

  //! FITUR TAMBAHAN: MANUAL CHURN PREDICTION (Untuk Postman/Testing)
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
}
