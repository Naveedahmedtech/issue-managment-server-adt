import {
    Body,
    Controller, Get,
    Param,
    Post, Query, Req, UseGuards,
} from "@nestjs/common";
import {CommentsService} from "./comments.service";
import {Request} from "express";
import {AuthGuard} from "../../guards/auth.guard";


@Controller({path: "comments", version: "1"})
@UseGuards(AuthGuard)
export class CommentsController {
    constructor(private readonly commentsService: CommentsService) {
    }

    @Post("/")
    async createIssue(
        @Req() req: Request,
        @Body()
        data: {
            message: string;
            projectId: string;
        },
    ) {
        return await this.commentsService.createComment(req, data);
    }

    @Get('/')
    async getAll(
        @Query("page") page: string,
        @Query("limit") limit: string,
        @Query("projectId") projectId: string,
    ) {
        const pageNumber = parseInt(page, 10) || 1;
        const limitNumber = parseInt(limit, 10) || 10;
        return await this.commentsService.getAll(pageNumber, limitNumber,projectId);
    }

    @Get('latest/:projectId')
    async getLatest(
        @Param("projectId") projectId: string,
    ) {
        return await this.commentsService.getLatest(projectId);
    }
}
