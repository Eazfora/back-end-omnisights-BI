import { IsNumber, IsNotEmpty, Min } from 'class-validator';

export class PredictChurnDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  recency!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  frequency!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  monetary!: number;
}
