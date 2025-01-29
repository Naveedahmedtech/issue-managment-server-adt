import { IsString, IsOptional, IsDate } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @Transform(({ value }) => value.toUpperCase()) // Convert status to uppercase
  status: string;

  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null)) // Ensure date is transformed
  startDate?: Date;

  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : null)) // Ensure date is transformed
  endDate?: Date;

  @IsOptional()
  @IsString()
  companyName?: string;

}
