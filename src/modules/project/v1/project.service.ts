import { Injectable, Logger } from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import { normalizeKeys } from "src/utils/common";

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createProject(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
  ) {
    try {
      const { id: userId } = req.userDetails;

      const newProject = await this.prisma.project.create({
        data: {
          title: req.body.title,
          description: req.body.description,
          status: req.body.status,
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate),
          userId,
        },
      });

      if (files && files.length > 0) {
        for (const file of files) {
          await this.prisma.file.create({
            data: {
              projectId: newProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
            },
          });
        }
      }

      this.logger.log(`Project created successfully: ${newProject.id}`);
      return { message: "Project created successfully", data: newProject };
    } catch (error) {
      this.logger.error("Failed to create project", error.stack);

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/projects", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }

  async updateProject(
    projectId: string,
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
  ) {
    try {
      const normalizedBody = normalizeKeys(req.body) as any;
      const { id: userId } = req.userDetails;

      console.log("BODY", normalizedBody);

      const updateData: any = {
        ...(normalizedBody.title && { title: normalizedBody.title }),
        ...(normalizedBody.description && {
          description: normalizedBody.description,
        }),
        ...(normalizedBody.status && { status: normalizedBody.status }),
        ...(normalizedBody.startDate && {
          startDate: new Date(normalizedBody.startDate),
        }),
        ...(normalizedBody.endDate && {
          endDate: new Date(normalizedBody.endDate),
        }),
        userId,
      };

      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });

      if (files && files.length > 0) {
        for (const file of files) {
          await this.prisma.file.create({
            data: {
              projectId: updatedProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
            },
          });
        }
      }

      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
      });

      const filesToKeep = files.map((file) => file.filename);
      for (const existingFile of existingFiles) {
        const filename = pathPosix.basename(existingFile.filePath);
        if (!filesToKeep.includes(filename)) {
          await unlink(join("./uploads/projects", filename));
          await this.prisma.file.delete({
            where: { id: existingFile.id },
          });
          this.logger.log(`Deleted file: ${filename}`);
        }
      }

      this.logger.log(`Project updated successfully: ${updatedProject.id}`);
      return { message: "Project updated successfully", data: updatedProject };
    } catch (error) {
      this.logger.error("Failed to update project", error.stack);

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/projects", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }

  async getProjects(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          files: true,
        },
      });

      const totalProjects = await this.prisma.project.count();
      const response = {
        total: totalProjects,
        page,
        limit,
        totalPages: Math.ceil(totalProjects / limit),
        projects
      }
      return {
        message: "Projects retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch projects", error.stack);
      throw error;
    }
  }


  async deleteProject(projectId: string, req: Request & { userDetails?: User }) {
    try {
      // Verify if the user owns the project
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          userId: req.userDetails?.id,
        },
      });
  
      if (!project) {
        this.logger.warn(`Project not found or access denied: ${projectId}`);
        throw new Error("Project not found or access denied");
      }
  
      // Find all associated files
      const files = await this.prisma.file.findMany({
        where: {
          projectId: projectId,
        },
      });
  
      // Delete project files from the file system
      for (const file of files) {
        try {
          await unlink(join("./uploads/projects", file.filePath));
          this.logger.log(`Deleted file from disk: ${file.filePath}`);
        } catch (err) {
          this.logger.error(`Failed to delete file from disk: ${file.filePath}`, err);
        }
      }
  
      // Delete files from the database
      await this.prisma.file.deleteMany({
        where: {
          projectId: projectId,
        },
      });
  
      // Delete the project
      await this.prisma.project.delete({
        where: {
          id: projectId,
        },
      });
  
      this.logger.log(`Project deleted successfully: ${projectId}`);
      return { message: "Project deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete project: ${projectId}`, error.stack);
      throw error;
    }
  }
  
}
