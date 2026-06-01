/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  Controller,
  Get,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Param,
  Patch,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  prisma: any;
  constructor(private readonly dashboardService: DashboardService) {}

  // Endpoint untuk ditarik oleh React Frontend (GET http://localhost:3000/api/dashboard/overview)
  @Get('overview')
  async getOverview() {
    return await this.dashboardService.getOverview();
  }

  // ENDPOINT BARU: GET http://localhost:3000/api/dashboard/products
  @Get('products')
  async getAllProducts() {
    const products = await this.dashboardService.getAllProducts();
    return {
      message: 'Daftar produk berhasil diambil',
      data: products,
    };
  }

  // Endpoint untuk memasukkan data baru (POST http://localhost:3000/api/dashboard/transactions)
  @Post('transactions')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createTransaction(@Body() body: CreateTransactionDto) {
    const result = await this.dashboardService.createTransaction(body);
    return {
      message: 'Transaksi berhasil disimpan ke database',
      data: result,
    };
  }

  @Post('products')
  @UsePipes(new ValidationPipe({ transform: true }))
  async createProduct(@Body() body: CreateProductDto) {
    const result = await this.dashboardService.createProduct(body);
    return {
      message: 'Produk baru berhasil ditambahkan',
      data: result,
    };
  }

  @Get('customer-insights/:customerId')
  async getCustomerInsight(@Param('customerId') customerId: string) {
    // 1. Ambil transaksi pelanggan ini dari database
    const transactions = await this.prisma.transaction.findMany({
      where: { customerId: customerId },
    });

    // 2. Kalkulasi RFM Sederhana
    const frequency = transactions.length;
    const monetary = transactions.reduce(
      (sum: any, tx: { totalSales: any }) => sum + tx.totalSales,
      0,
    );
    const lastTx = new Date(transactions[0].invoiceDate);
    const recency = Math.floor(
      (new Date().getTime() - lastTx.getTime()) / (1000 * 3600 * 24),
    );

    // 3. Prediksi ke model Python
    const prediction = await this.dashboardService.getChurnPrediction(
      recency,
      frequency,
      monetary,
    );

    return { customerId, prediction };
  }

  @Patch('update-stock/:productId')
  async updateStock(
    @Param('productId') productId: string,
    @Body('addedQuantity') addedQuantity: number,
  ) {
    return this.dashboardService.updateStock(productId, Number(addedQuantity));
  }

  // ENDPOINT BARU: GET http://localhost:3000/api/dashboard/forecast-chart
  @Get('forecast-chart')
  async getForecastChart() {
    return await this.dashboardService.getAdvancedForecast();
  }

  // ENDPOINT BARU: GET http://localhost:3000/api/dashboard/categories
  @Get('categories')
  async getCategories() {
    const categories = await this.dashboardService.getProductCategories();
    return {
      message: 'Daftar kategori berhasil diambil',
      data: categories,
    };
  }

  @Post('retrain-model')
  async retrainModel() {
    return await this.dashboardService.retrainForecastModel();
  }

  // ENDPOINT: GET http://localhost:3000/api/dashboard/inventory
  @Get('inventory')
  async getInventoryData() {
    return await this.dashboardService.getInventoryStatus();
  }

  @Get('customer-insights')
  async getCustomerInsights() {
    return await this.dashboardService.getCustomerInsights();
  }
}
