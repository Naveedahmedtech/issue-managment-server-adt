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
    params: { userId: string; fileId: string },
    files: Express.Multer.File,
  ) {
    const { userId, fileId } = params;

    try {
      // Validate input
      if (!userId) {
        throw new BadRequestException("File ID is required!");
      }
      if (!files) {
        throw new BadRequestException("No file provided!");
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
