import { Module } from '@nestjs/common';
import {CommentsController} from "./comments.controller";
import {CommentsService} from "./comments.service";
import {CommentsGateway} from "./comments.gateway";
import {PrismaService} from "../../utils/prisma.service";


@Module({
    controllers: [CommentsController],
    providers: [CommentsService, CommentsGateway, PrismaService],
})
export class CommentsModule {}
