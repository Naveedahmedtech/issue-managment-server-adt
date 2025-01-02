import { IsEmail, IsString, IsOptional, IsUUID, IsArray, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsUUID()
    roleId?: string;

    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    permissions?: string[];
}
