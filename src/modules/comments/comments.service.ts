import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/utils/prisma.service";
import { CommentsGateway } from "./comments.gateway";
import { Request } from "express";
import { User } from "@prisma/client";

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: CommentsGateway,
  ) {}

  /** Create a new comment */
  async createComment(
    req: Request & { userDetails?: User },
    dto: { message: string; projectId: string },
  ) {
    const { id: userId } = req.userDetails;
    try {
      const comment = await this.prisma.comment.create({
        data: {
          message: dto.message,
          project: { connect: { id: dto.projectId } },
          user: { connect: { id: userId } },
        },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      });

      // fire socket “ping”
      this.gateway.notifyNewComment();
      this.logger.log(`Comment created successfully: ${comment.id}!`);
      return { message: "Comment created successfully", data: comment };
    } catch (error) {
      this.logger.error("Failed to create comment", error);
      throw error;
    }
  }

  /** Fetch the very latest comment for “highlight” */
  async getLatest(projectId) {
    try {

      const comments = await this.prisma.comment.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });

      return comments || {};
    } catch (error) {
      this.logger.error("Failed to get the latest comments", error);
      throw error;
    }
  }

  /** (Optional) Fetch all comments */
  async getAll(page: number, limit: number, projectId) {
    try {
      const offset = (page - 1) * limit;
      const comments = await this.prisma.comment.findMany({
        where: { projectId },
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });
      const totalOrders = await this.prisma.comment.count({
        where: { projectId },
      });
      return {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit),
        comments,
      };
    } catch (error) {
      this.logger.error("Failed to get the comments", error);
      throw error;
    }
  }
}
