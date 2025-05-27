import { Module } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { ChecklistTemplateController } from './checklist.controller';
import { PrismaService } from 'src/utils/prisma.service';


@Module({
    controllers: [ChecklistTemplateController],
    providers: [ChecklistService, PrismaService],
})
export class ChecklistModule {}
