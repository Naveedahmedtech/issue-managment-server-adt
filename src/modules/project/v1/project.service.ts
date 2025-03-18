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
import * as PDFDocument from "pdfkit";
import * as path from "path";
import { promises as fs } from "fs";

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createProject(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
    body,
  ) {
    try {
      const { id: userId } = req.userDetails;

      if (body.companyId) {
        const company = await this.prisma.company.findUnique({
          where: {
            id: body.companyId,
          },
        });

        if (!company) {
          throw new NotFoundException("Company not found!");
        }
      }

      const newProject = await this.prisma.project.create({
        data: {
          title: body.title,
          description: body.description,
          status: body.status?.toUpperCase(),
          startDate: !body.startDate ? null : new Date(body.startDate),
          endDate: !body.endDate ? null : new Date(body.endDate),
          userId,
          companyId: body.companyId || null,
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
      this.logger.error("Failed to create project", error);

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
    data: any,
  ) {
    try {
      const { id: userId } = req.userDetails;

      // Build update data
      const updateData: any = {
        ...(data.title && { title: data.title }),
        ...(data.description && {
          description: data.description,
        }),
        ...(data.status && { status: data.status?.toUpperCase() }),
        ...(data.startDate && {
          startDate: !data.startDate ? null : new Date(data.startDate),
        }),
        ...(data.endDate && {
          endDate: !data.endDate ? null : new Date(data.endDate),
        }),
        ...(data.companyId && { companyId: data.companyId }),
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
      this.logger.error("Failed to update project", {
        message: error.message,
        stack: error,
      });

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
        error,
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
      this.logger.error("Failed to fetch projects", error);
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
          archived: false,
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
      this.logger.error("Failed to fetch projects", error);
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
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedUsers: {
            select: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                }
              }
            }
          }
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
      this.logger.error(`Failed to fetch project with id ${projectId}`, error);
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
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          project: {
            select: {
              id: true,
              archived: true,
              title: true
            },
          },
          assignedUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      // Initialize the columns with the required order
      const columns = [
        { id: "column-1", name: "Active", tasks: [] },
        { id: "column-2", name: "On Going", tasks: [] },
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
          user: {
            email: issue.user.email,
            displayName: issue.user.displayName,
          },
          project: {
            id: issue.project.id,
            archived: issue.project.archived,
            title: issue.project.title
          },
          endDate: issue.endDate,
          files: issue.issueFiles.map((file) => ({
            name: file.filePath.split("/").pop(),
            type: file.filePath.split(".").pop().toUpperCase(),
            url: file.filePath,
          })),
          assignedUsers: issue.assignedUsers,
          createdAt: issue.createdAt,
        };

        // Normalize the status to lowercase for comparison
        const status = issue.status.toLowerCase();

        // Push the task into the correct column based on its status
        switch (status?.toUpperCase()) {
          case "ACTIVE":
            columns[0].tasks.push(task);
            break;
          case "ON GOING":
            columns[1].tasks.push(task);
            break;
          case "COMPLETED":
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
        data: { issues, columns },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch issues for project with id ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async getAllProjectIssues(userId?: string) {
    try {
      // Build the query filter dynamically
      const filter = userId
        ? {
            assignedUsers: {
              some: {
                userId: userId, // Filters issues where the user is assigned
              },
            },
          }
        : {};

      // Fetch issues filtered by userId if provided
      const issues = await this.prisma.issue.findMany({
        where: filter,
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
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          project: {
            select: {
              id: true,
              archived: true,
              title: true,
            },
          },
          assignedUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      // Initialize columns
      const columns = [
        { id: "column-1", name: "Active", tasks: [] },
        { id: "column-2", name: "On Going", tasks: [] },
        { id: "column-3", name: "Completed", tasks: [] },
      ];

      // Iterate through issues and categorize them by status
      for (const issue of issues) {
        const task = {
          id: issue.id,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          startDate: issue.startDate,
          user: {
            email: issue.user.email,
            displayName: issue.user.displayName,
          },
          project: {
            name: issue.project.title,
            id: issue.project.id,
            archived: issue.project.archived,
          },
          endDate: issue.endDate,
          files: issue.issueFiles.map((file) => ({
            name: file.filePath.split("/").pop(),
            type: file.filePath.split(".").pop().toUpperCase(),
            url: file.filePath,
          })),
          assignedUsers: issue.assignedUsers,
        };

        // Normalize status and assign tasks to columns
        const status = issue.status?.toUpperCase();

        switch (status) {
          case "ACTIVE":
            columns[0].tasks.push(task);
            break;
          case "ON GOING":
            columns[1].tasks.push(task);
            break;
          case "COMPLETED":
            columns[2].tasks.push(task);
            break;
          default:
            columns[0].tasks.push(task); // Default to "Active" if status is unknown
            break;
        }
      }

      return {
        message: "Issues retrieved successfully!",
        data: { issues, columns },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch issues`, error);
      throw error;
    }
  }

  async getAllProjectFiles(
    projectId: string,
    page: number = 1,
    limit: number = 1000,
  ) {
    try {
      // Fetch files from the database
      const projectFiles = await this.prisma.file.findMany({
        where: { projectId },
        orderBy: {
          updatedAt: "desc",
        },
      });
      const issueFiles = await this.prisma.issueFile.findMany({
        where: { issue: { projectId } },
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          issue: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Combine and validate file existence
      const validateFileExists = async (file) => {
        const filePath = path.join("./", file.filePath);
        try {
          await fs.access(filePath); // Check if the file exists
          return true;
        } catch {
          return false;
        }
      };

      const files = [
        ...(
          await Promise.all(
            projectFiles.map(async (file) =>
              (await validateFileExists(file))
                ? { ...file, type: "projectFile", issue: null }
                : null,
            ),
          )
        ).filter(Boolean), // Filter out null entries
        ...(
          await Promise.all(
            issueFiles.map(async (file) =>
              (await validateFileExists(file))
                ? {
                    ...file,
                    type: "issueFile",
                    issue: { id: file.issue.id, title: file.issue.title },
                  }
                : null,
            ),
          )
        ).filter(Boolean),
      ];

      // Calculate pagination
      const totalFiles = files.length;
      const totalPages = Math.ceil(totalFiles / limit);
      const paginatedFiles = files.slice((page - 1) * limit, page * limit);

      return {
        message: "Files retrieved successfully!",
        data: {
          total: totalFiles,
          page,
          limit,
          totalPages,
          files: paginatedFiles,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch project files", error);
      throw error;
    }
  }

  async deleteProject(
    projectId: string,
    // req: Request & { userDetails?: User },
  ) {
    try {
      // Verify if the user owns the project
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          // userId: req.userDetails?.id,
        },
      });

      if (!project) {
        this.logger.warn(`Project not found: ${projectId}`);
        throw new Error("Project not found");
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
          await unlink(join("./", file.filePath));
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
      this.logger.error(`Failed to delete project: ${projectId}`, error);
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
          status: "ON GOING",
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
      this.logger.error("Failed to retrieve project statistics", error);
      throw error;
    }
  }

  async getRecentProjects(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    sortOrder: "asc" | "desc" = "desc",
  ) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Build dynamic where clause
      const where: any = {
        archived: false, // Only include non-archived projects
      };

      if (search) {
        where.title = {
          contains: search, // Case-insensitive search for title
          mode: "insensitive",
        };
      }

      if (status) {
        where.status = status?.toUpperCase(); // Filter by exact status
      }

      if (startDate) {
        where.startDate = {
          gte: new Date(startDate), // Start date should be greater than or equal to the provided date
        };
      }

      if (endDate) {
        where.endDate = {
          lte: new Date(endDate), // End date should be less than or equal to the provided date
        };
      }

      // Fetch recent projects with applied filters and sorting
      const recentProjects = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        where,
        orderBy: {
          createdAt: sortOrder, // Sort by createdAt (asc or desc)
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

      // Fetch the total project count with the same filters
      const totalProjects = await this.prisma.project.count({
        where,
      });

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
      this.logger.error("Failed to fetch recent projects", error);
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
      console.log("fileContext", fileContext);
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
      // const existingFilePath = join(
      //   "./", existingFile.filePath,
      // );
      // try {
      //   await unlink(existingFilePath);
      //   this.logger.log(`Unlinked existing file: ${existingFilePath}`);
      // } catch (unlinkError) {
      //   this.logger.error(
      //     `Failed to unlink file: ${existingFilePath}`,
      //     unlinkError,
      //   );
      // }

      // Construct the new file path
      const newFilePath = pathPosix.join(
        "uploads",
        "projects",
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
      this.logger.error("Failed to update file", error);
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
        }`,
      );

      return {
        message: `Project ${newArchivedState ? "archived" : "unarchived"} successfully`,
        data: updatedProject,
      };
    } catch (error) {
      this.logger.error("Failed to toggle archive state for project", {
        message: error.message,
        stack: error,
      });
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
          archived: true,
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
      this.logger.error("Failed to fetch projects", error);
      throw error;
    }
  }

  // ** LOG HISTORY FOR ISSUE TASKS
  async updateIssueLogHistory(
    req: Request & { userDetails?: User },
    issueId: string,
    updateData: Array<{
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }>,
  ) {
    const { id: userId } = req.userDetails;

    try {
      if (!Array.isArray(updateData) || updateData.length === 0) {
        throw new BadRequestException("Invalid or empty updateData array.");
      }

      // Validate each change
      const validChanges = updateData.filter(
        (change) =>
          change.fieldName &&
          change.oldValue !== undefined &&
          change.newValue !== undefined,
      );

      if (validChanges.length === 0) {
        throw new BadRequestException(
          "No valid changes provided in updateData.",
        );
      }

      // Log all valid changes
      await this.prisma.issueHistory.createMany({
        data: validChanges.map((change) => ({
          issueId,
          userId,
          fieldName: change.fieldName,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      });

      return {
        message: `${validChanges.length} change(s) logged successfully`,
        data: validChanges,
      };
    } catch (error) {
      console.error("Failed to log issue history:", error);
      throw error;
    }
  }

  async getIssuesHistory(
    projectId: string,
    page: number = 1,
    limit: number = 10,
    issueId?: string,
  ) {
    try {
      const offset = (page - 1) * limit;

      // Build the base `where` clause
      const whereClause: any = {
        issue: {
          projectId: projectId,
        },
      };

      // Add issueId to the `where` clause if provided
      if (issueId) {
        whereClause.issue.id = issueId;
      }

      // Fetch the issue history logs for the given projectId or issueId
      const history = await this.prisma.issueHistory.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc", // Order by latest logs
        },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
        },
      });

      // Count total history logs for the project or specific issue
      const totalHistory = await this.prisma.issueHistory.count({
        where: whereClause,
      });

      const response = {
        total: totalHistory,
        page,
        limit,
        totalPages: Math.ceil(totalHistory / limit),
        history,
      };

      return {
        message: "Issue history fetched successfully",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch issue history logs", error);
      throw error;
    }
  }

  async assignProject(body: { projectId: string; userIds: string[] }) {
    const { projectId, userIds } = body;
    try {
      // Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      
      if (!project) {
        throw new NotFoundException('Project not found');
      }
      
      // Verify all users exist
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: userIds }
        },
        select: {
          id: true,
          displayName: true,
          email: true
        }
      });
      
      if (users.length !== userIds.length) {
        throw new BadRequestException('One or more users not found');
      }
      
      // Remove any existing assignments for this project
      await this.prisma.projectAssignment.deleteMany({
        where: { projectId }
      });
      
      // Create new assignments
      const assignments = await this.prisma.projectAssignment.createMany({
        data: userIds.map(userId => ({
          projectId,
          userId
        })),
        skipDuplicates: true
      });
      
      this.logger.log(`Project ${projectId} assigned to ${assignments.count} users`);
      
      
      return {
        message: 'Project assigned successfully'
      };
    } catch (error) {
      this.logger.error("Failed to assign project", error);
      throw error;
    }
  }


  async removeAssignedUser(body: { projectId: string; userId: string }) {
    const { projectId, userId } = body;
    try {
      // Verify project exists
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
  
      if (!project) {
        throw new NotFoundException("Project not found");
      }
  
      // Verify user exists in the project assignment
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: {
          projectId,
          userId,
        },
      });
  
      if (!assignment) {
        throw new BadRequestException("User is not assigned to this project");
      }
  
      // Remove the user assignment
      await this.prisma.projectAssignment.delete({
        where: {
          projectId_userId: { projectId, userId }, // Assuming composite unique constraint on projectId and userId
        },
      });
  
      this.logger.log(`User ${userId} removed from project ${projectId}`);
  
      return {
        message: "User successfully unassigned from the project",
      };
    } catch (error) {
      this.logger.error("Failed to remove user assignment", error);
      throw error;
    }
  }
  
}
