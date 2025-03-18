import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import { normalizeKeys } from "src/utils/common";
import * as fs from "fs";
import * as path from "path";
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

  async createIssue(data: {
    title: string;
    description: string;
    status: string;
    startDate: string;
    endDate: string;
    projectId: string;
    userId: string;
    image?: string;
  }) {
    let relativePath: string | null = null;
  
    try {
      if (data.image) {
        // Validate Base64 format
        const match = data.image.match(/^data:(image\/[a-zA-Z]+);base64,/);
        if (!match) {
          throw new Error("Invalid Base64 image string");
        }
  
        const fileType = match[1].split("/")[1]; // Extract file extension (png, jpg, etc.)
        const base64Data = data.image.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
  
        // Generate a unique filename
        const filename = `issue-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileType}`;
  
        // Define relative and absolute paths
        relativePath = path.join("uploads/issues", filename);
        const absolutePath = path.join(__dirname, "../../../../", relativePath);
  
        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  
        // Write the file asynchronously
        await fs.promises.writeFile(absolutePath, base64Data, "base64");
      }
  
      // Create issue without worrying about image
      const newIssue = await this.prisma.issue.create({
        data: {
          title: data.title,
          description: data.description,
          status: data.status ? data.status.toUpperCase() : "ACTIVE",
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          projectId: data.projectId,
          userId: data.userId,
        },
      });
  
      // Save file record **only if image exists**
      if (relativePath) {
        await this.prisma.issueFile.create({
          data: {
            issueId: newIssue.id,
            filePath: relativePath.replace(/\\/g, "/"),
          },
        });
        this.logger.log("Issue file is saved!");
      }
  
      this.logger.log(`Issue created successfully: ${newIssue.id}`);
      return { message: "Issue created successfully", data: newIssue };
    } catch (error) {
      this.logger.error("Failed to create issue", error);
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
          await unlink(join("./", file.filePath));
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

  async assignUsersToIssue(issueId: string, userIds: string[]) {
    try {
      // Validate if the issue exists
      const issue = await this.prisma.issue.findUnique({
        where: { id: issueId },
      });

      if (!issue) {
        throw new NotFoundException(`Issue with ID ${issueId} does not exist`);
      }

      // Fetch currently assigned user IDs for this issue
      const existingAssignments = await this.prisma.issueAssignment.findMany({
        where: { issueId },
        select: { userId: true },
      });

      const existingUserIds = existingAssignments.map(
        (assignment) => assignment.userId,
      );

      // Filter out userIds that are already assigned to prevent duplicates
      const newUserIds = userIds.filter(
        (userId) => !existingUserIds.includes(userId),
      );

      if (newUserIds.length === 0) {
        return { message: "No new users to assign", data: issue };
      }

      // Create assignments for new user IDs
      const newAssignments = newUserIds.map((userId) => ({
        issueId,
        userId,
      }));

      // Bulk create new assignments
      await this.prisma.issueAssignment.createMany({
        data: newAssignments,
      });

      this.logger.log(`New users assigned to issue ${issueId} successfully`);

      // Return the updated list of assigned users
      const updatedIssue = await this.prisma.issue.findUnique({
        where: { id: issueId },
        include: {
          assignedUsers: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      return { message: "Users assigned successfully", data: updatedIssue };
    } catch (error) {
      this.logger.error(`Failed to assign users to issue ${issueId}`, error);
      throw error;
    }
  }

  async removeUserFromIssue(issueId: string, userId: string) {
    try {
      // Validate if the issue exists
      const issue = await this.prisma.issue.findUnique({
        where: { id: issueId },
      });

      if (!issue) {
        throw new NotFoundException(`Issue with ID ${issueId} does not exist`);
      }

      // Check if the user is assigned to the issue
      const assignment = await this.prisma.issueAssignment.findFirst({
        where: {
          issueId,
          userId,
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          `User with ID ${userId} is not assigned to issue ${issueId}`,
        );
      }

      // Remove the user assignment
      await this.prisma.issueAssignment.delete({
        where: {
          id: assignment.id,
        },
      });

      this.logger.log(
        `User ${userId} removed from issue ${issueId} successfully`,
      );

      // Return the updated list of assigned users
      const updatedIssue = await this.prisma.issue.findUnique({
        where: { id: issueId },
        include: {
          assignedUsers: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      return { message: "User removed successfully", data: updatedIssue };
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userId} from issue ${issueId}`,
        error,
      );
      throw error;
    }
  }
}
