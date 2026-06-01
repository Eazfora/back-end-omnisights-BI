import { IsString, IsInt, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  sku!: string;

  @IsNotEmpty()
  @IsInt()
  stock!: number;

  @IsNotEmpty()
  @IsString()
  category!: string;

  @IsNotEmpty()
  @IsNumber()
  price!: number;
}
