import {
  IsString,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';

export class CreateTransactionDto {
  @IsNotEmpty()
  @IsDateString()
  invoiceDate!: string;

  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @IsNotEmpty()
  @IsInt()
  quantity!: number;

  @IsNotEmpty()
  @IsNumber()
  unitPrice!: number;

  @IsNotEmpty()
  @IsNumber()
  totalSales!: number;

  @IsNotEmpty()
  @IsString()
  status!: string;

  @IsNotEmpty()
  @IsString()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  region!: string;
}
