import { Module } from '@nestjs/common';
import { PrismaService } from '../../../utils/prisma.service';
import { IssueService } from './issue.service';
import { IssueController } from './issue.controller';


@Module({
    controllers: [IssueController],
    providers: [IssueService, PrismaService],
})
export class IssueModule {}
