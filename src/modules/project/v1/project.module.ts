import { Module } from '@nestjs/common';
import { PrismaService } from '../../../utils/prisma.service';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';


@Module({
    controllers: [ProjectController],
    providers: [ProjectService, PrismaService],
})
export class ProjectModule {}
