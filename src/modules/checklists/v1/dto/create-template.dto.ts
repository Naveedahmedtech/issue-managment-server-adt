import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateChecklistTemplateDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString()
  description?: string;

  @IsBoolean()
  isDefault?: boolean

  @IsNotEmpty({ each: true })
  items: Array<{
    order: number;
    question: string;
  }>;
}

