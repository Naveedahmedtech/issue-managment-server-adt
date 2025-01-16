import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import { normalizeKeys } from "src/utils/common";
import * as PDFDocument from "pdfkit";
import * as path from "path";

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
          startDate:
            req.body.startDate === "" ? null : new Date(req.body.startDate),
          endDate: req.body.endDate === "" ? null : new Date(req.body.endDate),
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
        ...(normalizedBody.description && {
          description: normalizedBody.description,
        }),
        ...(normalizedBody.status && { status: normalizedBody.status }),
        ...(normalizedBody.startDate && {
          startDate:
            normalizedBody.startDate === ""
              ? null
              : new Date(normalizedBody.startDate),
        }),
        ...(normalizedBody.endDate && {
          endDate:
            normalizedBody.endDate === ""
              ? null
              : new Date(normalizedBody.endDate),
        }),
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
      const existingFileNames = existingFiles.map((file) =>
        pathPosix.basename(file.filePath),
      );

      // Add new files if they are not duplicates
      const newFiles = files.filter(
        (file) => !existingFileNames.includes(file.filename),
      );

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
        throw new NotFoundException("Project not found!");
      }

      // Fetch existing file paths for this project
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { filePath: true },
      });

      // Extract existing filenames
      const existingFileNames = existingFiles.map((file) =>
        pathPosix.basename(file.filePath),
      );

      // Separate new and existing files
      const newFiles = [];
      const skippedFiles = [];

      files.forEach((file) => {
        if (existingFileNames.includes(file.filename)) {
          skippedFiles.push({
            filename: file.filename,
            message: "File already exists for this project.",
          });
        } else {
          newFiles.push(file);
        }
      });

      // Insert only new files into the File table
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId,
              filePath: pathPosix.join("uploads", "projects", file.filename),
            },
          });
        }
      }

      this.logger.log(
        `Files uploaded to project: ${projectId}, Skipped files: ${skippedFiles.length}`,
      );

      return {
        message: "Files processed successfully!",
        projectId,
        uploadedFiles: newFiles.map((file) => file.filename),
        skippedFiles,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload files to project: ${projectId}`,
        error.stack,
      );

      // Cleanup uploaded files on error
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

  async getProjectList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;

      // Fetch projects with only id and name
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where: {
          archived: false
        },
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
      this.logger.error(
        `Failed to fetch project with id ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }

  async getProjectIssues(projectId: string) {
    try {
      // Fetch all issues for the given project ID along with their associated files
      const issues = await this.prisma.issue.findMany({
        where: { projectId },
        orderBy: {
          createdAt: "desc",
        },
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
          files: issue.issueFiles.map((file) => ({
            name: file.filePath.split("/").pop(),
            type: file.filePath.split(".").pop().toUpperCase(),
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

  async getAllProjectFiles(
    projectId: string,
    page: number = 1,
    limit: number = 1000,
  ) {
    try {
      // const offset = (page - 1) * limit;

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
        // skip: offset,
        // take: limit,
        orderBy: {
          createdAt: "desc",
        },
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
        // skip: offset,
        // take: limit,
        orderBy: {
          createdAt: "desc",
        },
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
        ...projectFiles.map((file) => ({
          ...file,
          type: "projectFile",
          issue: null,
        })),
        ...issueFiles.map((file) => ({
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

  async deleteProject(
    projectId: string,
    req: Request & { userDetails?: User },
  ) {
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
          this.logger.error(
            `Failed to delete file from disk: ${file.filePath}`,
            err,
          );
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

  async getProjectStats() {
    try {
      // Fetch total project count
      const totalProjects = await this.prisma.project.count();

      // Fetch total issue count
      const totalIssues = await this.prisma.issue.count();

      // Fetch total completed issues count
      const totalCompletedIssues = await this.prisma.issue.count({
        where: {
          status: "COMPLETED",
        },
      });

      // Fetch total to-do issues count
      const totalToDoIssues = await this.prisma.issue.count({
        where: {
          status: "TO DO",
        },
      });

      return {
        message: "Project statistics retrieved successfully!",
        data: {
          totalProjects,
          totalIssues,
          totalCompletedIssues,
          totalToDoIssues,
        },
      };
    } catch (error) {
      this.logger.error("Failed to retrieve project statistics", error.stack);
      throw error;
    }
  }

  async getRecentProjects(page: number = 1, limit: number = 10) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Fetch recent projects, ordered by creation date (most recent first)
      const recentProjects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where: {
          archived: false
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Fetch the total project count for pagination
      const totalProjects = await this.prisma.project.count();

      // Return the response
      return {
        message: "Recent projects retrieved successfully!",
        data: {
          page,
          limit,
          totalProjects,
          totalPages: Math.ceil(totalProjects / limit),
          projects: recentProjects,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch recent projects", error.stack);
      throw error;
    }
  }

  async generateProjectReport(
    res: Response,
    projectId: string,
    filters?: any,
  ): Promise<{ message: string; projectId: string; data: Buffer }> {
    try {
      // Fetch project details along with filtered issues and files
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          issues: {
            where: filters || {},
            orderBy: { createdAt: "desc" },
            include: {
              issueFiles: true,
            },
          },
          files: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!project) throw new NotFoundException("Project not found");

      // === Calculate Issue Summary ===
      const totalIssues = project.issues.length;
      const openIssues = project.issues.filter(
        (issue) => issue.status === "TO DO",
      ).length;
      const inProgressIssues = project.issues.filter(
        (issue) => issue.status === "IN PROGRESS",
      ).length;
      const closedIssues = project.issues.filter(
        (issue) => issue.status === "COMPLETED",
      ).length;

      // === Create a PDF document ===
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("error", (error) => {
        throw new Error(`PDF generation error: ${error.message}`);
      });

      // === PDF Content ===
      // === Cover Page ===
      doc.fontSize(26).text("Project Report", { align: "center" });
      doc.moveDown();
      doc
        .fontSize(18)
        .text(`Project Title: ${project.title}`, { align: "center" });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, {
        align: "center",
      });
      doc.moveDown(2);

      // Line separator
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // === Project Details Section ===
      doc.fontSize(16).text("Project Details", { underline: true });
      doc.fontSize(12).text(`Description: ${project.description || "N/A"}`);
      doc.text(`Status: ${project.status}`);
      doc.text(
        `Start Date: ${project.startDate ? new Date(project.startDate).toLocaleDateString() : "N/A"}`,
      );
      doc.text(
        `End Date: ${project.endDate ? new Date(project.endDate).toLocaleDateString() : "N/A"}`,
      );
      doc.moveDown();

      // Line separator
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      // === Executive Summary Section ===
      doc.fontSize(16).text("Executive Summary", { underline: true });
      doc.fontSize(12).text(`Total Issues: ${totalIssues}`);
      doc.text(` - Todo: ${openIssues}`);
      doc.text(` - In Progress: ${inProgressIssues}`);
      doc.text(` - Completed: ${closedIssues}`);
      doc.moveDown();

      // === Project Files Section ===
      if (project.files && project.files.length > 0) {
        doc.fontSize(16).text("Project Files", { underline: true });
        doc.moveDown(0.5);

        // Table Header
        doc.fontSize(12).fillColor("gray").text("File Name", 50);
        doc.text("Download Link", 250);
        doc.text("Created At", 450);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke(); // Line under header

        // Table Rows
        project.files.forEach((file) => {
          const fileName = path.basename(file.filePath);
          const fileUrl = `${process.env.SERVER_URL || "http://localhost:3000"}/${file.filePath}`;

          // Display File Name
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor("black").text(fileName, 50);

          // Display Download Link
          doc.fillColor("blue").text("[Open]", 250, doc.y, {
            link: fileUrl,
            underline: true,
          });

          // Display Created At Date
          doc
            .fillColor("black")
            .text(new Date(file.createdAt).toLocaleString(), 450);
        });

        doc.moveDown();
      }

      // === Issues Section ===
      project.issues.forEach((issue, index) => {
        // Calculate required space for the issue block
        let issueBlockHeight = 100; // Base height for title, description, and status
        if (issue.issueFiles && issue.issueFiles.length > 0) {
          issueBlockHeight += issue.issueFiles.length * 20; // Add space for each attached file
        }

        // Add a new page if the remaining space is less than required
        if (
          doc.y + issueBlockHeight >
          doc.page.height - doc.page.margins.bottom
        ) {
          doc.addPage();
        }

        // === Issue Title ===
        doc
          .fontSize(14)
          .fillColor("black")
          .text(`${index + 1}. Issue Title: ${issue.title}`, {
            underline: true,
          });

        // === Issue Details ===
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .fillColor("black")
          .text(`   Description: ${issue.description ?? "N/A"}`);
        doc.text(`   Status: ${issue.status}`);
        doc.text(
          `   Created At: ${new Date(issue.createdAt).toLocaleString()}`,
        );
        doc.moveDown(0.5);

        // === Attached Files ===
        if (issue.issueFiles && issue.issueFiles.length > 0) {
          doc.fontSize(12).fillColor("black").text("   Attached Files:");
          issue.issueFiles.forEach((file) => {
            const filename = path.basename(file.filePath);
            const fileUrl = `${process.env.SERVER_URL || "http://localhost:3000"}/${file.filePath}`;

            // Display the file link
            doc.fillColor("blue").text(`      - ${filename} [Open File]`, {
              link: fileUrl,
              underline: true,
            });
          });
        }

        doc.moveDown(1.5); // Space between issues
      });

      // === Footer Section ===
      doc.moveTo(50, 750).lineTo(550, 750).stroke();
      doc
        .fontSize(10)
        .text(`Project ID: ${projectId}`, 50, 760, { align: "center" });

      // Finalize the PDF and return the buffer
      doc.end();

      // Wait for the PDF to finish generating
      return new Promise((resolve) => {
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve({
            message: "PDF_GENERATED",
            projectId: projectId,
            data: pdfBuffer,
          });
        });
      });
    } catch (error) {
      this.logger.error(`Error while generating PDF: ${error.message}`);
      throw error;
    }
  }

  async updateFile(
    params: { projectId?: string; issueId?: string; fileId: string },
    files: Express.Multer.File,
  ) {
    const { projectId, issueId, fileId } = params;

    try {
      // Validate input
      if (!fileId) {
        throw new BadRequestException("File ID is required!");
      }
      if (!files) {
        throw new BadRequestException("No file provided!");
      }
      if (!projectId && !issueId) {
        throw new BadRequestException(
          "Either projectId or issueId is required!",
        );
      }

      // Determine the context: project or issue
      const fileContext = projectId ? "project" : "issue";

      // Find the file in the database
      let existingFile;
      if (fileContext === "project") {
        existingFile = await this.prisma.file.findUnique({
          where: { id: fileId },
          include: { project: true },
        });
      } else {
        existingFile = await this.prisma.issueFile.findUnique({
          where: { id: fileId },
          include: { issue: true },
        });
      }

      if (!existingFile) {
        throw new NotFoundException("File not found!");
      }

      // Unlink the existing file from the server
      const existingFilePath = join(
        "./uploads",
        fileContext === "project" ? "projects" : "issues",
        pathPosix.basename(existingFile.filePath),
      );
      try {
        await unlink(existingFilePath);
        this.logger.log(`Unlinked existing file: ${existingFilePath}`);
      } catch (unlinkError) {
        this.logger.error(
          `Failed to unlink file: ${existingFilePath}`,
          unlinkError,
        );
      }

      // Construct the new file path
      const newFilePath = pathPosix.join(
        "uploads",
        "updatedFiles",
        files[0].filename,
      );

      // Update the file path in the database
      if (fileContext === "project") {
        await this.prisma.file.update({
          where: { id: fileId },
          data: { filePath: newFilePath },
        });
      } else {
        await this.prisma.issueFile.update({
          where: { id: fileId },
          data: { filePath: newFilePath },
        });
      }

      this.logger.log(
        `File updated for ${fileContext}: ${fileContext === "project" ? projectId : issueId}, fileId: ${fileId}`,
      );

      return {
        message: "File updated successfully!",
        updatedFilePath: newFilePath,
      };
    } catch (error) {
      this.logger.error("Failed to update file", error.stack);
      throw error;
    }
  }

  async downloadFile(fileId: string, type: "project" | "issue") {
    try {
      // Fetch file details based on the type
      const file =
        type === "project"
          ? await this.prisma.file.findUnique({
              where: { id: fileId },
            })
          : await this.prisma.issueFile.findUnique({
              where: { id: fileId },
            });

      if (!file) {
        throw new NotFoundException("File not found!");
      }

      const filePath = join(
        "./uploads",
        type === "project" ? "projects" : "issues",
        pathPosix.basename(file.filePath),
      );

      // Send the file to the user
      return { 
        message: "DOWNLOAD_FILE",
        data: { filePath },
      };
    } catch (error) {
      this.logger.error(`Error downloading file: ${error.message}`);
      throw error;
    }
  } 



  async toggleArchiveProject(projectId: string) {
    try {
      // Find the project to ensure it exists and get the current archived state
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
  
      if (!project) {
        throw new NotFoundException("Project not found!");
      }
  
      // Toggle the archived state
      const newArchivedState = !project.archived;
  
      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          archived: newArchivedState, // Toggle the state
        },
      });
  
      this.logger.log(
        `Project ${newArchivedState ? "archived" : "unarchived"} successfully: ${
          updatedProject.id
        }`
      );
  
      return {
        message: `Project ${newArchivedState ? "archived" : "unarchived"} successfully`,
        data: updatedProject,
      };
    } catch (error) {
      this.logger.error("Failed to toggle archive state for project", error.stack);
      throw error;
    }
  }

  async getArchivedProjectList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;

      // Fetch projects with only id and name
      const projects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where: {
          archived: true
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          description: true,
        },
      });

      const totalProjects = await this.prisma.project.count({
        where: {
          archived: true,
        },
      });
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

}
