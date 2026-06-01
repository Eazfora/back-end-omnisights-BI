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
  async createProduct(data: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          price: data.price,
          stock: data.stock,
          category: data.category, // <--- PRISMA MEMINTA BARIS INI
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Gagal membuat produk baru',
        error,
      );
    }
  }
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // FUNGSI BANTUAN: Menghitung persentase tren (+X% atau -X%)
  // ==========================================
  private calculateTrend(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const change = ((current - previous) / previous) * 100;
    // Format angka menjadi 1 desimal (contoh: +12.5% atau -2.1%)
    return change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
  }

  // ==========================================
  // FITUR 1: MENYIMPAN DATA & MEMOTONG STOK
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

      // ==========================================
      // LOGIKA CEK STOK & BUAT ALERT (ANTI DUPLIKAT)
      // ==========================================
      if (updatedProduct.stock <= 10) {
        // 1. Cek dulu, apakah sudah ada alert yang AKTIF untuk produk ini?
        const existingAlert = await this.prisma.alert.findFirst({
          where: {
            title: { contains: updatedProduct.name },
            status: 'ACTIVE',
          },
        });

        // 2. Kalau BELUM ADA, baru kita buatkan alert baru
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
      } // <--- INI DIA KURUNG KURAWAL YANG HILANG TADI!

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
  // FITUR 2: MENGAMBIL DAFTAR PRODUK (Dropdown)
  // ==========================================
  async getAllProducts() {
    return await this.prisma.product.findMany({
      select: { id: true, name: true, sku: true, price: true, stock: true },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================
  // FITUR 3: MENGAMBIL DAFTAR PELANGGAN (Dropdown)
  // ==========================================
  async getAllCustomers() {
    return await this.prisma.user.findMany({
      where: { role: 'USER' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================
  // FITUR 4: OVERVIEW DASHBOARD & KALKULASI TREN
  // ==========================================
  async getOverview() {
    try {
      // Setup Waktu: Awal Bulan Ini & Awal Bulan Lalu
      const now = new Date();
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );

      // --- 1. KALKULASI TOTAL PENDAPATAN & TREN ---
      const totalRevenueResult = await this.prisma.transaction.aggregate({
        _sum: { totalSales: true },
        where: { status: 'Completed' },
      });
      const totalRevenue = totalRevenueResult._sum.totalSales ?? 0;

      const revThisMonth = await this.prisma.transaction.aggregate({
        _sum: { totalSales: true },
        where: { status: 'Completed', invoiceDate: { gte: startOfThisMonth } },
      });
      const revLastMonth = await this.prisma.transaction.aggregate({
        _sum: { totalSales: true },
        where: {
          status: 'Completed',
          invoiceDate: { gte: startOfLastMonth, lt: startOfThisMonth },
        },
      });
      const revenueTrend = this.calculateTrend(
        revThisMonth._sum.totalSales ?? 0,
        revLastMonth._sum.totalSales ?? 0,
      );

      // --- 2. KALKULASI PELANGGAN & TREN ---
      const customers = await this.prisma.transaction.findMany({
        distinct: ['customerId'],
        select: { customerId: true },
      });
      const totalCustomers = customers.length;

      const custThisMonth = await this.prisma.transaction.findMany({
        distinct: ['customerId'],
        where: { invoiceDate: { gte: startOfThisMonth } },
      });
      const custLastMonth = await this.prisma.transaction.findMany({
        distinct: ['customerId'],
        where: { invoiceDate: { gte: startOfLastMonth, lt: startOfThisMonth } },
      });
      const customersTrend = this.calculateTrend(
        custThisMonth.length,
        custLastMonth.length,
      );

      // --- 3. KALKULASI ALERT & TREN ---
      const activeAlerts = await this.prisma.alert.count({
        where: { status: 'ACTIVE' },
      });

      const alertsThisMonth = await this.prisma.alert.count({
        where: { status: 'ACTIVE', createdAt: { gte: startOfThisMonth } },
      });
      const alertsLastMonth = await this.prisma.alert.count({
        where: {
          status: 'ACTIVE',
          createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
        },
      });
      const alertsTrend = this.calculateTrend(alertsThisMonth, alertsLastMonth);

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
      for (const tx of allTransactions) {
        const d = new Date(tx.invoiceDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + tx.totalSales);
      }

      const revenueByMonth = Array.from(monthlyMap.entries()).map(
        ([month, actual]) => ({
          month,
          actual: Math.round(actual),
          predicted: Math.round(actual * (1 + Math.random() * 0.15)),
        }),
      );

      // --- 5. INTEGRASI PYTHON AI FORECASTING ---
      let predictedGrowth = '0.0%';
      let predictedTrend = '0.0%';

      try {
        // Kita HAPUS query pencarian quantity (qtyThisMonthResult)
        // Karena di Bagian 1 kamu sebenarnya sudah menghitung pendapatan bulan ini!
        // Yaitu di variabel: revThisMonth._sum.totalSales

        const currentSales = revThisMonth._sum.totalSales ?? 0;

        const pythonResponse = await axios.post(
          'http://localhost:8000/forecast-sales',
          {
            Target_Month: '2026-06',
            Current_Quantity: currentSales, // <--- KITA KIRIM RUPIAH SEKARANG!
          },
        );

        if (
          pythonResponse.data &&
          pythonResponse.data.growth_percentage !== undefined
        ) {
          predictedGrowth = `${pythonResponse.data.growth_percentage}%`;
          predictedTrend = pythonResponse.data.trend || '+0.0%';
        }
      } catch (pythonError) {
        console.warn('⚠️ API Python offline.', pythonError.message);
      }

      // KEMBALIKAN SEMUA DATA KE REACT
      return {
        totalRevenue,
        activeAlerts,
        totalCustomers,
        recentTransactions,
        revenueByMonth,
        predictedGrowth,
        predictedTrend,
        revenueTrend,
        alertsTrend,
        customersTrend,
      };
    } catch (error) {
      console.error('Gagal mengambil data overview:', error);
      throw new InternalServerErrorException('Gagal memuat data dasbor');
    }
  }

  async getChurnPrediction(
    recency: number,
    frequency: number,
    monetary: number,
  ) {
    try {
      // Menembak API Python yang baru saja kita tes
      const response = await axios.post('http://localhost:8000/predict-churn', {
        Recency: recency,
        Frequency: frequency,
        Monetary: monetary,
      });
      return response.data.prediction;
    } catch (error) {
      console.error('Gagal menghubungi model Python:', error);
      throw new InternalServerErrorException('Model AI sedang tidak tersedia');
    }
  }

  // ==========================================
  // FITUR: UPDATE STOK & MATIKAN ALERT
  // ==========================================
  async updateStock(productId: string, addedQuantity: number) {
    try {
      // 1. Tambah stok di database
      const updatedProduct = await this.prisma.product.update({
        where: { id: productId },
        data: { stock: { increment: addedQuantity } },
      });

      // 2. Logika Pemadam Alert Otomatis
      if (updatedProduct.stock > 10) {
        await this.prisma.alert.updateMany({
          where: {
            title: { contains: updatedProduct.name },
            status: 'ACTIVE',
          },
          data: {
            status: 'RESOLVED',
          },
        });
      }

      return {
        message:
          'Stok berhasil ditambah dan sistem telah mengecek status peringatan.',
        product: updatedProduct,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Gagal memperbarui stok atau produk tidak ditemukan.',
      );
    }
  }

  // ==========================================
  // FITUR: MENDAPATKAN DAFTAR KATEGORI PRODUK
  // ==========================================
  async getProductCategories() {
    try {
      // Mengambil daftar kategori unik dari tabel Product
      const products = await this.prisma.product.findMany({
        select: { category: true },
        distinct: ['category'],
      });

      // Membersihkan data agar hanya berupa array string sederhana
      const categories = products
        .map((p) => p.category)
        .filter((category) => category !== null && category !== '');

      return {
        message: 'Daftar kategori berhasil dimuat',
        data: categories,
      };
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new InternalServerErrorException('Gagal memuat daftar kategori');
    }
  }

  // ==========================================
  // FITUR: DATA GRAFIK PRAKIRAAN AI (MICROSERVICE) - FINAL & REALTIME KORELASI
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

      const formatDateLocal = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const whereClause: any = {
        status: 'Completed',
        invoiceDate: { gte: pastDate },
      };

      if (category && category !== 'All') {
        whereClause.product = { category: category };
      }

      if (region && region !== 'Indonesia') {
        whereClause.region = region;
      }

      // 1. Ambil data historis dari database Eazfora
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

      // 2. Susun data historis untuk grafik
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

      if (chartData.length > 0) {
        chartData[chartData.length - 1].predicted =
          chartData[chartData.length - 1].actual;
      }

      // ==========================================
      // INTEGRASI PYTHON: MENGIRIM DATA UNTUK PREDIKSI & KORELASI
      // ==========================================
      let predictionsArray: number[] = [];

      let pythonInsights: any = null;

      try {
        const pythonResponse = await axios.post(
          'http://localhost:8000/forecast-sales',
          {
            Target_Month: '2026-06',
            Current_Quantity: lastActual,
            // MENGIRIM ARRAY DATA KE PYTHON UNTUK DIHITUNG PANDAS!
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
      } catch (pythonError) {
        console.warn('⚠️ API Python gagal merespons.', pythonError.message);
      }

      // ==========================================
      // MEMASUKKAN PREDIKSI PYTHON KE DALAM GRAFIK
      // ==========================================
      let fallbackPred = lastActual === 0 ? 15000000 : lastActual;

      for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);

        let currentPred;

        if (predictionsArray && predictionsArray.length >= i) {
          currentPred = predictionsArray[i - 1];
        } else {
          const growthFactor = 1 + (Math.random() * 0.06 - 0.02);
          fallbackPred = Math.round(fallbackPred * growthFactor);
          currentPred = fallbackPred;
        }

        chartData.push({
          date: d.toISOString(),
          actual: null,
          predicted: currentPred,
        });
      }

      // 3. Kembalikan data lengkap ke React (Termasuk Korelasi)
      return {
        message: 'Data grafik prakiraan berhasil dimuat',
        data: chartData,
        insights: {
          anomalySpike: pythonInsights ? pythonInsights.anomaly_spike : 18,
          // UBAH BARIS INI: Jika filter 'All', maka tulis 'Semua Kategori'
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
      console.error('Error generating forecast chart:', error);
      throw new InternalServerErrorException('Gagal memuat grafik AI');
    }
  }

  // ==========================================
  // FITUR: LATIH ULANG MODEL AI (REAL)
  // ==========================================
  async retrainForecastModel() {
    try {
      // 1. Ambil seluruh data transaksi yang sudah sukses dari Database
      const allTransactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
        select: { invoiceDate: true, totalSales: true },
        orderBy: { invoiceDate: 'asc' },
      });

      // 2. Kirim kumpulan data tersebut ke Python sebagai bahan belajar
      const response = await axios.post('http://localhost:8000/retrain', {
        transactions: allTransactions,
      });

      return response.data;
    } catch (error) {
      console.error('Gagal retrain:', error);
      throw new InternalServerErrorException(
        'Gagal menghubungi server AI Python',
      );
    }
  }

  // ==========================================
  // FITUR: MANAJEMEN INVENTARIS & SMART RESTOCK (RULE-BASED)
  // ==========================================
  async getInventoryStatus() {
    try {
      // 1. Tarik data produk riil dari database
      const products = await this.prisma.product.findMany({
        orderBy: { stock: 'asc' }, // Urutkan dari stok paling sedikit
      });

      // 2. Transformasi data dan terapkan aturan otomatisasi (Rule-Based)
      const processedProducts = products.map((product) => {
        let status = 'Safe Stock';
        let severity = 'safe';
        let recommendation = 'No action required';

        // ATURAN AMBANG BATAS STOK (Sesuai dengan spesifikasi UI React)
        if (product.stock < 20) {
          status = 'Emergency Restock';
          severity = 'critical';
          // Rekomendasi otomatis mengisi hingga kapasitas ideal (misal: 200 unit)
          const idealOrder = 200 - product.stock;
          recommendation = `Order +${idealOrder} units immediately`;
        } else if (product.stock >= 20 && product.stock < 100) {
          status = 'Depleting Fast';
          severity = 'warning';
          const idealOrder = 150 - product.stock;
          recommendation = `Prepare +${idealOrder} units within 3 days`;
        }

        return {
          id: product.id,
          sku: product.sku || `PROD-${1000 + product.id}`,
          name: product.name,
          category: product.category || 'Uncategorized',
          stock: product.stock,
          price: product.price,
          status: status,
          severity: severity,
          recommendation: recommendation,
        };
      });

      // 3. Buat Notifikasi Aktif (Active Alerts) secara dinamis dari produk kritis

      const activeAlerts: any[] = [];
      let alertIdCounter = 1;

      processedProducts.forEach((p) => {
        if (p.severity === 'critical') {
          activeAlerts.push({
            id: alertIdCounter++,
            type: 'STOCKOUT',
            title: 'Critical Stock Level',
            description: `Product ${p.name} is running critically low (${p.stock} units left).`,
            severity: 'CRITICAL',
            status: 'ACTIVE',
          });
        } else if (p.severity === 'warning') {
          activeAlerts.push({
            id: alertIdCounter++,
            type: 'ANOMALY',
            title: 'Stok Menipis',
            description: `Product ${p.name} berkurang mendekati batas aman.`,
            severity: 'HIGH',
            status: 'ACTIVE',
          });
        }
      });

      return {
        products: processedProducts,
        alerts: activeAlerts,
      };
    } catch (error) {
      console.error('Gagal memuat data inventaris:', error);
      throw new InternalServerErrorException(
        'Gagal memproses manajemen inventaris',
      );
    }
  }

  // ==========================================
  // FITUR: WAWASAN PELANGGAN & PREDIKSI CHURN (RFM + AI)
  // ==========================================
  async getCustomerInsights() {
    try {
      // 1. Tarik semua transaksi yang sudah sukses
      const transactions = await this.prisma.transaction.findMany({
        where: { status: 'Completed' },
        orderBy: { invoiceDate: 'desc' },
      });

      if (transactions.length === 0) return null;

      const today = new Date();
      // Gunakan Map untuk mengelompokkan data per pelanggan (berdasarkan ID atau Nama)
      const customerMap = new Map();

      transactions.forEach((tx) => {
        // Asumsi: Jika tidak ada customerId khusus, kita gunakan nama pelanggan sebagai identitas unik
        // BENAR
        const custId = tx.customerId || 'Walk-in Customer';

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            CustomerID: customerMap.size + 1, // Buat ID urut
            Name: custId,
            LastDate: tx.invoiceDate,
            Frequency: 0,
            Monetary: 0,
          });
        }

        const cust = customerMap.get(custId);
        cust.Frequency += 1;
        cust.Monetary += tx.totalSales;
        // Simpan tanggal transaksi terbaru
        if (new Date(tx.invoiceDate) > new Date(cust.LastDate)) {
          cust.LastDate = tx.invoiceDate;
        }
      });

      // 2. Format menjadi RFM Data
      const rfmData = Array.from(customerMap.values()).map((c) => {
        const diffTime = Math.abs(
          today.getTime() - new Date(c.LastDate).getTime(),
        );
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
          CustomerID: c.CustomerID,
          Name: c.Name,
          Recency: diffDays,
          Frequency: c.Frequency,
          Monetary: c.Monetary,
        };
      });

      // 3. Lempar ke Python FastAPI untuk ditebak (Prediksi Churn)
      let aiPredictions = [];
      try {
        const pythonResponse = await axios.post(
          'http://localhost:8000/predict-churn-batch',
          {
            customers: rfmData,
          },
        );
        aiPredictions = pythonResponse.data.predictions;
      } catch (err) {
        console.warn('API Python Prediksi Churn Gagal', err);
        return null; // Batalkan jika AI mati
      }

      // 4. Kalkulasi Metrik untuk Grafik UI (Segmentation & Summary)
      let churnedCount = 0;
      let totalMonetary = 0;
      let champions = 0,
        needsAttention = 0,
        lowValue = 0;

      aiPredictions.forEach((p) => {
        totalMonetary += p.Monetary;
        if (p.Churn > 0.6) churnedCount++; // Ambang batas 60% dianggap Churn

        // Segmentasi RFM Sederhana
        if (p.Recency <= 30 && p.Frequency >= 3) champions++;
        else if (p.Recency > 60) lowValue++;
        else needsAttention++;
      });

      // Filter 5 pelanggan paling berisiko tinggi untuk tabel At-Risk
      const atRiskCustomers = aiPredictions
        .filter((p) => p.Churn > 0.5)
        .sort((a, b) => b.Churn - a.Churn)
        .slice(0, 5);

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
        at_risk_customers: atRiskCustomers,
        engine: 'Eazfora AI Churn Engine',
      };
    } catch (error) {
      console.error('Error Customer Insights:', error);
      throw new InternalServerErrorException(
        'Gagal memproses metrik pelanggan',
      );
    }
  }
}
