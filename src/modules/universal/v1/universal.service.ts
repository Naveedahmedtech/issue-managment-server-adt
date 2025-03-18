import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "src/utils/prisma.service";
import * as fs from "fs";
import * as path from "path";
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


  async saveSignature(base64String: string, orderId: string, fileId: string, initials: 'initials' | 'signature') {
    try {
      // Extract file type from Base64 metadata
      const match = base64String.match(/^data:(image\/[a-zA-Z]+);base64,/);
      if (!match) {
        throw new Error("Invalid Base64 string");
      }
  
      const fileType = match[1].split("/")[1]; // Extract file extension (png, jpg, etc.)
      const base64Data = base64String.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
  
  
      // ✅ 2. Determine the type (Signature or Initial)
      const suffix = initials === 'initials' ? "initial" : "signature";
  
      // ✅ 3. Generate filename with correct suffix
      const filename = `${suffix}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileType}`;
  
      // ✅ 4. Define relative path for storage
      const relativePath = path.join("uploads/orders/signatures", filename);
  
      // ✅ 5. Get absolute path for writing the file
      const absolutePath = path.join(__dirname, "../../../../", relativePath);
  
      // ✅ 6. Ensure directory exists
      const uploadDir = path.dirname(absolutePath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
  
      // ✅ 7. Save the file
      fs.writeFileSync(absolutePath, base64Data, "base64");
  
      // ✅ 8. Save metadata to the database
      const signatureRecord = await this.prisma.orderSignatures.create({
        data: {
          orderId,
          fileId,
          path: relativePath, // ✅ Store only the relative path
          filename,
        },
      });
  
      return {
        message: `${suffix.charAt(0).toUpperCase() + suffix.slice(1)} added successfully!`,
        signature: signatureRecord,
      };
    } catch (error) {
      this.logger.error("Error while adding signature!", error);
      throw error;
    }
  }
}
