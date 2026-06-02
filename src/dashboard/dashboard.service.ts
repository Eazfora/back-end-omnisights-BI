import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // FUNGSI BANTUAN: Menghitung Tren & Arah
  // ==========================================
  private calculateTrend(current: number, prev: number): string {
    if (prev === 0) return current > 0 ? '+100%' : '0%';
    const trend = ((current - prev) / prev) * 100;
    return `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`;
  }

  private calculateTrendDirection(
    current: number,
    prev: number,
  ): 'up' | 'down' | 'neutral' {
    if (current > prev) return 'up';
    if (current < prev) return 'down';
    return 'neutral';
  }

  // ==========================================
  // FITUR: MENYIMPAN PRODUK BARU
  // ==========================================
  async createProduct(data: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          price: data.price,
          stock: data.stock,
          category: data.category,
        },
      });
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Gagal membuat produk baru',
        error.message,
      );
    }
  }

  // ==========================================
  // FITUR: MENYIMPAN TRANSAKSI & MEMOTONG STOK
  // ==========================================
  async createTransaction(data: CreateTransactionDto) {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
      });

      if (!product)
        throw new NotFoundException('Produk tidak ditemukan di database.');
      if (product.stock < data.quantity)
        throw new BadRequestException(
          `Stok tidak mencukupi! Sisa stok hanya ${product.stock}.`,
        );

      const [newTransaction, updatedProduct] = await this.prisma.$transaction([
        this.prisma.transaction.create({
          data: {
            invoiceDate: new Date(data.invoiceDate),
            customerId: data.customerId,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            totalSales: data.totalSales,
            status: data.status,
            productId: data.productId,
            region: data.region,
          },
        }),
        this.prisma.product.update({
          where: { id: data.productId },
          data: { stock: { decrement: data.quantity } },
        }),
      ]);

      // LOGIKA CEK STOK & BUAT ALERT
      if (updatedProduct.stock <= 10) {
        const existingAlert = await this.prisma.alert.findFirst({
          where: { title: { contains: updatedProduct.name }, status: 'ACTIVE' },
        });

        if (!existingAlert) {
          await this.prisma.alert.create({
            data: {
              title: `Stok Kritis: ${updatedProduct.name}`,
              description: `Sisa stok hanya ${updatedProduct.stock} pcs. Segera lakukan restock!`,
              severity: 'WARNING',
              type: 'WARNING',
              status: 'ACTIVE',
            },
          });
        }
      }

      return newTransaction;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error;
      throw new InternalServerErrorException(
        'Gagal memproses transaksi ke database',
      );
    }
  }

  // ==========================================
  // FITUR: MENGAMBIL DAFTAR PRODUK & PELANGGAN
  // ==========================================
  async getAllProducts() {
    return await this.prisma.product.findMany({
      select: { id: true, name: true, sku: true, price: true, stock: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAllCustomers() {
    return await this.prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================
  // FITUR: OVERVIEW DASHBOARD & KALKULASI TREN
  // ==========================================
  // --- FUNGSI GET OVERVIEW YANG DIPERBAIKI ---
  async getOverview() {
    try {
      const now = new Date();
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );

      // --- 1. KALKULASI TOTAL PENDAPATAN ---
      const totalRevenueResult = await this.prisma.transaction.aggregate({
        _sum: { totalSales: true },
        where: { status: 'Completed' },
      });
      const totalRevenue = totalRevenueResult._sum.totalSales ?? 0;

      const [revThisMonth, revLastMonth] = await Promise.all([
        this.prisma.transaction.aggregate({
          _sum: { totalSales: true },
          where: {
            status: 'Completed',
            invoiceDate: { gte: startOfThisMonth },
          },
        }),
        this.prisma.transaction.aggregate({
          _sum: { totalSales: true },
          where: {
            status: 'Completed',
            invoiceDate: { gte: startOfLastMonth, lt: startOfThisMonth },
          },
        }),
      ]);

      const currentRev = revThisMonth._sum.totalSales ?? 0;
      const prevRev = revLastMonth._sum.totalSales ?? 0;
      const revenueTrend = this.calculateTrend(currentRev, prevRev);
      const revenueTrendDirection = this.calculateTrendDirection(
        currentRev,
        prevRev,
      );

      // --- 2. KALKULASI PELANGGAN ---
      // Optimasi: Gunakan groupBy untuk performa lebih baik daripada findMany
      const [custThisMonth, custLastMonth] = await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['customerId'],
          where: { invoiceDate: { gte: startOfThisMonth } },
        }),
        this.prisma.transaction.groupBy({
          by: ['customerId'],
          where: {
            invoiceDate: { gte: startOfLastMonth, lt: startOfThisMonth },
          },
        }),
      ]);

      const totalCustomers = (
        await this.prisma.transaction.groupBy({ by: ['customerId'] })
      ).length;
      const customersTrend = this.calculateTrend(
        custThisMonth.length,
        custLastMonth.length,
      );
      const customersTrendDirection = this.calculateTrendDirection(
        custThisMonth.length,
        custLastMonth.length,
      );

      // --- 3. KALKULASI ALERT ---
      const [activeAlerts, alertsThisMonth, alertsLastMonth] =
        await Promise.all([
          this.prisma.alert.count({ where: { status: 'ACTIVE' } }),
          this.prisma.alert.count({
            where: { status: 'ACTIVE', createdAt: { gte: startOfThisMonth } },
          }),
          this.prisma.alert.count({
            where: {
              status: 'ACTIVE',
              createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
            },
          }),
        ]);

      const alertsTrend = this.calculateTrend(alertsThisMonth, alertsLastMonth);
      const alertsTrendDirection = this.calculateTrendDirection(
        alertsThisMonth,
        alertsLastMonth,
      );

      // --- 4. TRANSAKSI TERBARU & CHART ---
      const recentTransactions = await this.prisma.transaction.findMany({
        take: 8,
        orderBy: { invoiceDate: 'desc' },
        include: { product: { select: { name: true, sku: true } } },
      });

      const allTransactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
        select: { invoiceDate: true, totalSales: true },
        orderBy: { invoiceDate: 'asc' },
      });

      const monthlyMap = new Map<string, number>();
      allTransactions.forEach((tx) => {
        const d = new Date(tx.invoiceDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + tx.totalSales);
      });

      const revenueByMonth = Array.from(monthlyMap.entries()).map(
        ([month, actual]) => ({
          month,
          actual: Math.round(actual),
          predicted: Math.round(actual * (1 + Math.random() * 0.15)), // AI Mockup
        }),
      );

      // --- 5. INTEGRASI PYTHON AI FORECASTING ---
      let predictedGrowth = '0.0%';
      let predictedTrend = '0.0%';

      try {
        const pythonResponse = await axios.post(
          'http://localhost:8000/forecast-sales',
          {
            Target_Month: '2026-06',
            Current_Quantity: currentRev,
          },
        );

        if (pythonResponse.data?.growth_percentage !== undefined) {
          predictedGrowth = `${pythonResponse.data.growth_percentage}%`;
          predictedTrend = pythonResponse.data.trend || '+0.0%';
        }
      } catch (pythonError) {
        console.warn('⚠️ API Python offline/gagal.');
      }

      return {
        totalRevenue,
        activeAlerts,
        totalCustomers,
        recentTransactions,
        revenueByMonth,
        predictedGrowth,
        predictedTrend,
        revenueTrend,
        revenueTrendDirection,
        alertsTrend,
        alertsTrendDirection,
        customersTrend,
        customersTrendDirection,
      };
    } catch (error) {
      console.error('Gagal mengambil data overview:', error);
      throw new InternalServerErrorException('Gagal memuat data dasbor');
    }
  }
  // ==========================================
  // FITUR: PREDIKSI CHURN MANUAL
  // ==========================================
  async getChurnPrediction(
    recency: number,
    frequency: number,
    monetary: number,
  ) {
    try {
      const response = await axios.post('http://localhost:8000/predict-churn', {
        Recency: recency,
        Frequency: frequency,
        Monetary: monetary,
      });
      return response.data.prediction;
    } catch (error) {
      throw new InternalServerErrorException('Model AI sedang tidak tersedia');
    }
  }

  // ==========================================
  // FITUR: UPDATE STOK & MATIKAN ALERT
  // ==========================================
  async updateStock(productId: string, addedQuantity: number) {
    try {
      const updatedProduct = await this.prisma.product.update({
        where: { id: productId },
        data: { stock: { increment: addedQuantity } },
      });

      if (updatedProduct.stock > 10) {
        await this.prisma.alert.updateMany({
          where: { title: { contains: updatedProduct.name }, status: 'ACTIVE' },
          data: { status: 'RESOLVED' },
        });
      }

      return {
        message: 'Stok ditambah & alert dicek.',
        product: updatedProduct,
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal memperbarui stok.');
    }
  }

  // ==========================================
  // FITUR: KATEGORI PRODUK
  // ==========================================
  async getProductCategories() {
    try {
      const products = await this.prisma.product.findMany({
        select: { category: true },
        distinct: ['category'],
      });
      const categories = products
        .map((p) => p.category)
        .filter((c) => c !== null && c !== '');
      return { message: 'Daftar kategori dimuat', data: categories };
    } catch (error) {
      throw new InternalServerErrorException('Gagal memuat kategori');
    }
  }

  // ==========================================
  // FITUR: DATA GRAFIK PRAKIRAAN AI (ADVANCED FORECAST)
  // ==========================================
  async getAdvancedForecast(
    category?: string,
    range?: string,
    region?: string,
  ) {
    try {
      const days = range ? parseInt(range, 10) : 30;
      const today = new Date();
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - days);

      const formatDateLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const whereClause: any = {
        status: 'Completed',
        invoiceDate: { gte: pastDate },
      };
      if (category && category !== 'All')
        whereClause.product = { category: category };
      if (region && region !== 'Indonesia') whereClause.region = region;

      const transactions = await this.prisma.transaction.findMany({
        where: whereClause,
        include: { product: true },
        orderBy: { invoiceDate: 'asc' },
      });

      const dailyData = new Map<string, number>();
      transactions.forEach((tx) => {
        const dateStr = formatDateLocal(tx.invoiceDate);
        dailyData.set(dateStr, (dailyData.get(dateStr) || 0) + tx.totalSales);
      });

      const chartData = [];
      let lastActual = 0;

      for (let i = days; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = formatDateLocal(d);
        const actual = dailyData.get(dateStr) || 0;

        chartData.push({
          date: d.toISOString(),
          actual: actual,
          predicted: null,
        });
        if (i === 0) lastActual = actual;
      }

      if (chartData.length > 0)
        chartData[chartData.length - 1].predicted =
          chartData[chartData.length - 1].actual;

      let predictionsArray: number[] = [];
      let pythonInsights: any = null;

      try {
        const pythonResponse = await axios.post(
          'http://localhost:8000/forecast-sales',
          {
            Target_Month: '2026-06',
            Current_Quantity: lastActual,
            Historical_Data: chartData.map((d) => ({
              date: d.date,
              sales: d.actual,
            })),
          },
        );

        if (pythonResponse.data && pythonResponse.data.status === 'success') {
          predictionsArray = pythonResponse.data.predictions_array;
          pythonInsights = pythonResponse.data;
        }
      } catch (pythonError: any) {
        console.warn('⚠️ API Python gagal merespons.', pythonError.message);
      }

      let fallbackPred = lastActual === 0 ? 15000000 : lastActual;

      for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        let currentPred;

        if (predictionsArray && predictionsArray.length >= i) {
          currentPred = predictionsArray[i - 1];
        } else {
          fallbackPred = Math.round(
            fallbackPred * (1 + (Math.random() * 0.06 - 0.02)),
          );
          currentPred = fallbackPred;
        }

        chartData.push({
          date: d.toISOString(),
          actual: null,
          predicted: currentPred,
        });
      }

      return {
        message: 'Data grafik prakiraan berhasil dimuat',
        data: chartData,
        insights: {
          anomalySpike: pythonInsights ? pythonInsights.anomaly_spike : 18,
          anomalyCategory:
            category && category !== 'All' ? category : 'Semua Kategori',
          confidenceScore: pythonInsights
            ? pythonInsights.confidence_score
            : 85,
          correlation:
            pythonInsights && pythonInsights.correlation
              ? pythonInsights.correlation
              : { promo: 0.85, weekend: 0.72 },
        },
      };
    } catch (error) {
      throw new InternalServerErrorException('Gagal memuat grafik AI');
    }
  }

  // ==========================================
  // FITUR: RETRAIN MODEL
  // ==========================================
  async retrainForecastModel() {
    try {
      const allTransactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
        select: { invoiceDate: true, totalSales: true },
        orderBy: { invoiceDate: 'asc' },
      });
      const response = await axios.post('http://localhost:8000/retrain', {
        transactions: allTransactions,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(
        'Gagal menghubungi server AI Python',
      );
    }
  }

  // ==========================================
  // FITUR: INVENTORY STATUS (RULE-BASED)
  // ==========================================
  async getInventoryStatus() {
    try {
      const products = await this.prisma.product.findMany({
        orderBy: { stock: 'asc' },
      });
      const activeAlerts: any[] = [];
      let alertIdCounter = 1;

      const processedProducts = products.map((product) => {
        let status = 'Safe Stock';
        let severity = 'safe';
        let recommendation = 'No action required';

        if (product.stock < 20) {
          status = 'Emergency Restock';
          severity = 'critical';
          recommendation = `Order +${200 - product.stock} units immediately`;
          activeAlerts.push({
            id: alertIdCounter++,
            type: 'STOCKOUT',
            title: 'Critical Stock Level',
            description: `Product ${product.name} is running critically low.`,
            severity: 'CRITICAL',
            status: 'ACTIVE',
          });
        } else if (product.stock >= 20 && product.stock < 100) {
          status = 'Depleting Fast';
          severity = 'warning';
          recommendation = `Prepare +${150 - product.stock} units within 3 days`;
          activeAlerts.push({
            id: alertIdCounter++,
            type: 'ANOMALY',
            title: 'Stok Menipis',
            description: `Product ${product.name} mendekati batas aman.`,
            severity: 'HIGH',
            status: 'ACTIVE',
          });
        }

        return {
          id: product.id,
          sku: product.sku || `PROD-${1000 + product.id}`,
          name: product.name,
          category: product.category || 'Uncategorized',
          stock: product.stock,
          price: product.price,
          status,
          severity,
          recommendation,
        };
      });

      return { products: processedProducts, alerts: activeAlerts };
    } catch (error) {
      throw new InternalServerErrorException(
        'Gagal memproses manajemen inventaris',
      );
    }
  }

  // ==========================================
  // FITUR: CUSTOMER INSIGHTS
  // ==========================================
  async getCustomerInsights() {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
        orderBy: { invoiceDate: 'desc' },
      });
      if (transactions.length === 0) return null;

      const customerMap = new Map();
      transactions.forEach((tx) => {
        const custId = tx.customerId || 'Walk-in Customer';
        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            CustomerID: customerMap.size + 1,
            Name: custId,
            LastDate: tx.invoiceDate,
            Frequency: 0,
            Monetary: 0,
          });
        }
        const cust = customerMap.get(custId);
        cust.Frequency += 1;
        cust.Monetary += tx.totalSales;
        if (new Date(tx.invoiceDate) > new Date(cust.LastDate))
          cust.LastDate = tx.invoiceDate;
      });

      const rfmData = Array.from(customerMap.values()).map((c) => ({
        ...c,
        Recency: Math.ceil(
          Math.abs(new Date().getTime() - new Date(c.LastDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      }));

      let aiPredictions = [];
      try {
        const pythonResponse = await axios.post(
          'http://localhost:8000/predict-churn-batch',
          { customers: rfmData },
        );
        aiPredictions = pythonResponse.data.predictions;
      } catch (err) {
        console.warn('API Python Prediksi Churn Gagal', err);
        return null;
      }

      let churnedCount = 0;
      let totalMonetary = 0;
      let champions = 0,
        needsAttention = 0,
        lowValue = 0;

      aiPredictions.forEach((p) => {
        totalMonetary += p.Monetary;
        if (p.Churn > 0.6) churnedCount++;
        if (p.Recency <= 30 && p.Frequency >= 3) champions++;
        else if (p.Recency > 60) lowValue++;
        else needsAttention++;
      });

      return {
        total_customers: aiPredictions.length,
        churned: churnedCount,
        retained: aiPredictions.length - churnedCount,
        churn_rate: (churnedCount / aiPredictions.length) * 100,
        avg_monetary: totalMonetary / aiPredictions.length,
        segments: {
          champions,
          needs_attention: needsAttention,
          low_value: lowValue,
        },
        at_risk_customers: aiPredictions
          .filter((p) => p.Churn > 0.5)
          .sort((a, b) => b.Churn - a.Churn)
          .slice(0, 5),
        engine: 'Eazfora AI Churn Engine',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Gagal memproses metrik pelanggan',
      );
    }
  }
}
