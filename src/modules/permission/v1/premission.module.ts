import { Module } from '@nestjs/common';
import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { PrismaService } from '../../../utils/prisma.service';

@Module({
    controllers: [PermissionController],
    providers: [PermissionService, PrismaService],
})
export class PermissionModule {}
