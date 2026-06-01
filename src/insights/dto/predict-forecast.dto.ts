import { IsInt, Min, IsNotEmpty } from 'class-validator';

export class PredictForecastDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1, { message: 'Bulan_Kedepan minimal harus bernilai 1' })
  Bulan_Kedepan!: number;
}
