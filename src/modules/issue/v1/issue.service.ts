import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import { normalizeKeys } from "src/utils/common";
// import { ROLES } from "src/constants/roles-permissions.constants";


export interface ExtendedUser extends User {
  role: {
      id: string;
      name: string;
      permissions: string[];
  };
}

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
          startDate: req.body.startDate ? new Date(req.body.startDate) : null,
          endDate: req.body.endDate ? new Date(req.body.endDate) : null,
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

      this.logger.log(`issue created successfully: ${newIssue.id}`);
      return { message: "issue created successfully", data: newIssue };
    } catch (error) {
      this.logger.error("Failed to create issue", error);

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

  async updateIssue(
    issueId: string,
    req: Request & { userDetails?: ExtendedUser },
    files: Array<Express.Multer.File>,
  ) {
    // const { id: userId, role } = req.userDetails;
    try {
      // Validate if the issue exists
      const existingIssue = await this.prisma.issue.findUnique({
        where: { id: issueId },
      });

      if (!existingIssue) {
        throw new Error("Issue not found!");
      }

      // Check if the user's role is WORKER and if they are the owner of the issue
      // if (role?.name === ROLES.WORKER && existingIssue.userId !== userId) {
      //   throw new UnauthorizedException("You are not authorized to update this issue.");
      // }

      // Normalize request body for partial updates
      const normalizedBody = normalizeKeys(req.body) as any;

      // Build the update data by only including fields that are present in the request body
      const updateData: any = {
        ...(normalizedBody.title && { title: normalizedBody.title }),
        ...(normalizedBody.description && {
          description: normalizedBody.description,
        }),
        ...(normalizedBody.status && {
          status: normalizedBody.status.toUpperCase(),
        }),
        ...(normalizedBody.startDate && {
          startDate: new Date(normalizedBody.startDate),
        }),
        ...(normalizedBody.endDate && {
          endDate: new Date(normalizedBody.endDate),
        }),
      };

      // Update the issue details (if there are any updates)
      const updatedIssue = await this.prisma.issue.update({
        where: { id: issueId },
        data: updateData,
      });

      // Handle file uploads (add new files to the issue)
      if (files && files.length > 0) {
        for (const file of files) {
          await this.prisma.issueFile.create({
            data: {
              issueId: updatedIssue.id,
              filePath: pathPosix.join("uploads", "issues", file.filename),
            },
          });
        }
      }

      // Fetch the updated issue with all associated files
      const updatedIssueWithFiles = await this.prisma.issue.findUnique({
        where: { id: issueId },
        include: {
          issueFiles: {
            select: {
              id: true,
              filePath: true,
            },
          },
        },
      });

      // Log success
      this.logger.log(`Issue updated successfully: ${updatedIssue.id}`);

      // Return the updated issue with files
      return {
        message: "Issue updated successfully!",
        data: updatedIssueWithFiles,
      };
    } catch (error) {
      this.logger.error("Failed to update issue", error);

      // Cleanup newly uploaded files in case of an error
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

  async deleteIssue(issueId: string) {
    try {
      const existingIssue = await this.prisma.issue.findUnique({
        where: { id: issueId },
        include: {
          issueFiles: true,
        },
      });

      if (!existingIssue) {
        throw new NotFoundException(`Issue ${issueId} does not exist`);
      }

      // Delete associated files from the file system
      for (const file of existingIssue.issueFiles) {
        try {
          await unlink(
            join("./", file.filePath),
          );
          this.logger.log(`Deleted file from server: ${file.filePath}`);
        } catch (error) {
          this.logger.error(`Failed to delete file: ${file.filePath}`, error);
        }
      }

      // Delete the issue and its associated files from the database
      await this.prisma.issue.delete({
        where: { id: issueId },
      });

      await this.prisma.issueFile.deleteMany({
        where: { issueId },
      });

      this.logger.log(`Issue deleted successfully: ${issueId}`);
      return { message: "Issue deleted successfully!" };
    } catch (error) {
      this.logger.error(`Failed to delete issue: ${issueId}`, error);
      throw error;
    }
  }
}
