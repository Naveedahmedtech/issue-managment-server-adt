import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaService } from '../../../utils/prisma.service';


@Module({
    controllers: [UserController],
    providers: [UserService, PrismaService],
})
export class UserModule {}
