import { IsString, IsOptional } from 'class-validator';

export class UpdatePermissionDto {
    @IsOptional()
    @IsString()
    action?: string;

    @IsOptional()
    @IsString()
    description?: string;
}
