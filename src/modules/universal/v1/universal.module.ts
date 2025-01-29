import { Module } from '@nestjs/common';
import { PrismaService } from '../../../utils/prisma.service';
import { UniversalService } from './universal.service';
import { UniversalController } from './universal.controller';


@Module({
    controllers: [UniversalController],
    providers: [UniversalService, PrismaService],
})
export class UniversalModule {}
