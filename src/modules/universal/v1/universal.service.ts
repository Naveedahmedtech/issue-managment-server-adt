import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/utils/prisma.service";

import { posix as pathPosix } from "path";

@Injectable()
export class UniversalService {
  private readonly logger = new Logger(UniversalService.name);

  constructor(private readonly prisma: PrismaService) {}
  async updateFile(
    params: { userId: string; fileId: string; issueId: string },
    files: Express.Multer.File,
  ) {
    const { userId, fileId, issueId } = params;

    try {
      // Validate input
      if (!userId && !fileId && !issueId) {
        throw new BadRequestException(
          "user Id, issue Id and file Id is required!",
        );
      }
      if (!files) {
        throw new BadRequestException("No file provided!");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException("User not found!");
      }

      const existingFile = await this.prisma.file.findUnique({
        where: { id: fileId },
        include: { project: true },
      });

      if (!existingFile) {
        throw new NotFoundException("File not found!");
      }

      // Construct the new file path
      const newFilePath = pathPosix.join(
        "uploads",
        "projects",
        files[0].filename,
      );

      await this.prisma.file.update({
        where: { id: fileId },
        data: { filePath: newFilePath },
      });

      // Check if the IssueFile record exists
      const existingIssueFile = await this.prisma.issueFile.findUnique({
        where: {
          issueId_fileId: {
            issueId: issueId,
            fileId: fileId,
          },
        },
      });

      if (existingIssueFile) {
        // If IssueFile already exists, update it
        await this.prisma.issueFile.update({
          where: { id: existingIssueFile.id },
          data: { filePath: newFilePath }, // You can update the filePath or any other field
        });
      } else {
        // If IssueFile doesn't exist, create a new one
        await this.prisma.issueFile.create({
          data: {
            filePath: newFilePath,
            issueId: issueId,
            projectId: existingFile.projectId,
            fileId
          },
        });
      }

      this.logger.log(`File updated fileId: ${fileId}`);

      return {
        message: "File updated successfully!",
        updatedFilePath: newFilePath,
      };
    } catch (error) {
      this.logger.error("Failed to update file", error);
      throw error;
    }
  }
}
