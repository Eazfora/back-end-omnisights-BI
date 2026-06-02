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
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview() {
    return await this.dashboardService.getOverview();
  }

  @Get('products')
  async getAllProducts() {
    const products = await this.dashboardService.getAllProducts();
    return {
      message: 'Daftar produk berhasil diambil',
      data: products,
    };
  }

  @Get('inventory')
  async getInventoryData() {
    return await this.dashboardService.getInventoryStatus();
  }

  @Get('customer-insights')
  async getCustomerInsights() {
    return await this.dashboardService.getCustomerInsights();
  }

  @Get('categories')
  async getCategories() {
    const categories = await this.dashboardService.getProductCategories();
    return {
      message: 'Daftar kategori berhasil diambil',
      data: categories,
    };
  }

  @Get('forecast-chart')
  async getForecastChart() {
    return await this.dashboardService.getAdvancedForecast();
  }

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

  @Post('retrain-model')
  async retrainModel() {
    return await this.dashboardService.retrainForecastModel();
  }

  @Patch('update-stock/:productId')
  async updateStock(
    @Param('productId') productId: string,
    @Body('addedQuantity') addedQuantity: number,
  ) {
    return this.dashboardService.updateStock(productId, Number(addedQuantity));
  }
}
