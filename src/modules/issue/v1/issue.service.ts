import { Injectable, Logger } from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";

@Injectable()
export class IssueService {
  private readonly logger = new Logger(IssueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createIssue(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
  ) {
    try {
      const { id: userId } = req.userDetails;

      const newIssue = await this.prisma.issue.create({
        data: {
          title: req.body.title,
          description: req.body.description,
          status: req.body?.status?.toUpperCase(),
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate),
          projectId: req.body.projectId,
          userId,
        },
      });

      if (files && files.length > 0) {
        for (const file of files) {
          await this.prisma.issueFile.create({
            data: {
              issueId: newIssue.id,
              filePath: pathPosix.join("uploads", "issues", file.filename),
            },
          });
        }
      }

      this.logger.log(`Project created successfully: ${newIssue.id}`);
      return { message: "Project created successfully", data: newIssue };
    } catch (error) {
      this.logger.error("Failed to create project", error.stack);

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/issues", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }


  
}
