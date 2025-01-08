import { Injectable, Logger, NotFoundException } from "@nestjs/common";
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
  
      // Build update data
      const updateData: any = {
        ...(normalizedBody.title && { title: normalizedBody.title }),
        ...(normalizedBody.description && { description: normalizedBody.description }),
        ...(normalizedBody.status && { status: normalizedBody.status }),
        ...(normalizedBody.startDate && { startDate: new Date(normalizedBody.startDate) }),
        ...(normalizedBody.endDate && { endDate: new Date(normalizedBody.endDate) }),
        userId,
      };
  
      // Update project details
      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });
  
      // Get existing files for this project
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: {
          id: true,
          filePath: true,
        },
      });
  
      // Extract filenames of already uploaded files
      const existingFileNames = existingFiles.map(file => pathPosix.basename(file.filePath));
  
      // Add new files if they are not duplicates
      const newFiles = files.filter(file => !existingFileNames.includes(file.filename));
  
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId: updatedProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
            },
          });
        }
      }
  
      // Return updated project with files
      const allFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: {
          id: true,
          filePath: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  
      this.logger.log(`Project updated successfully: ${updatedProject.id}`);
      return {
        message: "Project updated successfully!",
        data: {
          ...updatedProject,
          files: allFiles,
        },
      };
    } catch (error) {
      // Error handling with cleanup for newly uploaded files
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
  



  async uploadFilesToProject(
    projectId: string,
    files: Array<Express.Multer.File>,
  ) {
    try {
      // Validate if the project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
  
      if (!project) {
        throw new Error('Project not found!');
      }
  
      // Fetch existing file paths for this project
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { filePath: true },
      });
  
      // Extract existing filenames
      const existingFileNames = existingFiles.map(file =>
        pathPosix.basename(file.filePath),
      );
  
      // Filter out already uploaded files
      const newFiles = files.filter(file => !existingFileNames.includes(file.filename));
  
      // Insert only new files into the File table
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId,
              filePath: pathPosix.join('uploads', 'projects', file.filename),
            },
          });
        }
      }
  
      this.logger.log(
        `Files uploaded to project: ${projectId}, Skipped files: ${files.length - newFiles.length}`,
      );
  
      return {
        message: 'Files uploaded successfully!',
        projectId,
        skippedFiles: files.length - newFiles.length,
        uploadedFiles: newFiles.length,
      };
    } catch (error) {
      this.logger.error(`Failed to upload files to project: ${projectId}`, error.stack);
  
      // Cleanup uploaded files on error
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join('./uploads/projects', file.filename));
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


  async getProjectList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      
      // Fetch projects with only id and name
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
        },
      });
  
      const totalProjects = await this.prisma.project.count();
      const response = {
        total: totalProjects,
        page,
        limit,
        totalPages: Math.ceil(totalProjects / limit),
        projects,
      };
      return {
        message: "Projects retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch projects", error.stack);
      throw error;
    }
  }
  


  async getById(projectId: string) {
    try {
      // Fetch project by ID along with its files
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          files: {
            select: {
              id: true,
              filePath: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
  
      if (!project) {
        throw new NotFoundException("Project not found");
      }
  
      return {
        message: "Project retrieved successfully!",
        data: project,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch project with id ${projectId}`, error.stack);
      throw error;
    }
  }


  async getProjectIssues(projectId: string) {
    try {
      // Fetch all issues for the given project ID along with their associated files
      const issues = await this.prisma.issue.findMany({
        where: { projectId },
        include: {
          issueFiles: {
            select: {
              id: true,
              filePath: true,
            },
          },
        },
      });
  
      // Initialize the columns with the required order
      const columns = [
        { id: "column-1", name: "To Do", tasks: [] },
        { id: "column-2", name: "In Progress", tasks: [] },
        { id: "column-3", name: "Completed", tasks: [] },
      ];
  
      // Iterate through the issues and push them into the appropriate column
      for (const issue of issues) {
        const task = {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          startDate: issue.startDate,
          endDate: issue.endDate,
          files: issue.issueFiles.map(file => ({
            name: file.filePath.split('/').pop(),
            type: file.filePath.split('.').pop().toUpperCase(),
            url: file.filePath,
          })),
        };
  
        // Normalize the status to lowercase for comparison
        const status = issue.status.toLowerCase();
  
        // Push the task into the correct column based on its status
        switch (status) {
          case "to do":
            columns[0].tasks.push(task);
            break;
          case "in progress":
            columns[1].tasks.push(task);
            break;
          case "completed":
            columns[2].tasks.push(task);
            break;
          default:
            // If status is unknown, push it to the "To Do" column by default
            columns[0].tasks.push(task);
            break;
        }
      }
  
      return {
        message: "Project issues retrieved successfully!",
        data: columns,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch issues for project with id ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }
  
  
  
  
  


  async getAllProjectFiles(projectId: string, page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
  
      // Get total counts for projectFiles and issueFiles
      const projectFilesCount = await this.prisma.file.count({
        where: { projectId },
      });
  
      const issueFilesCount = await this.prisma.issueFile.count({
        where: { issue: { projectId } },
      });
  
      // Fetch project files with pagination
      const projectFiles = await this.prisma.file.findMany({
        where: { projectId },
        skip: offset,
        take: limit,
        select: {
          id: true,
          filePath: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  
      // Fetch issue files with pagination
      const issueFiles = await this.prisma.issueFile.findMany({
        where: { issue: { projectId } },
        skip: offset,
        take: limit,
        select: {
          id: true,
          filePath: true,
          createdAt: true,
          updatedAt: true,
          issue: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });
  
      // Combine files
      const files = [
        ...projectFiles.map(file => ({
          ...file,
          type: "projectFile",
          issue: null,
        })),
        ...issueFiles.map(file => ({
          ...file,
          type: "issueFile",
          issue: {
            id: file.issue.id,
            title: file.issue.title,
          },
        })),
      ];
  
      // Calculate total files and total pages
      const totalFiles = projectFilesCount + issueFilesCount;
      const totalPages = Math.ceil(totalFiles / limit);
  
      // Response
      const response = {
        total: totalFiles,
        page,
        limit,
        totalPages,
        files,
      };
  
      return {
        message: "Files retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch project files", error.stack);
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
