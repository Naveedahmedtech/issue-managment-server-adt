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
import { getISOWeek } from "src/utils/date-utils";

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

      // 1) Validate companyId as before…
      if (body.companyId) {
        const company = await this.prisma.company.findUnique({
          where: { id: body.companyId },
        });
        if (!company) throw new NotFoundException("Company not found!");
      }

      // 2) Parse the project dates up front
      const startDt = body.startDate ? new Date(body.startDate) : null;
      const endDt = body.endDate ? new Date(body.endDate) : null;

      // 3) If you’ve got userIds to assign, check conflicts
      let candidates: string[] = [];
      if (body.userIds && startDt && endDt) {
        const parsedUserIds: string[] = JSON.parse(body.userIds);
        if (parsedUserIds.length) {
          // find any existing availability overlapping this window, including username
          const conflicts = await this.prisma.availability.findMany({
            where: {
              userId: { in: parsedUserIds },
              AND: [
                { startDate: { lte: endDt } },
                { endDate: { gte: startDt } },
              ],
            },
            select: {
              user: {
                select: { displayName: true },
              },
            },
          });

          if (conflicts.length) {
            // extract unique usernames
            const conflictNames = Array.from(
              new Set(conflicts.map((c) => c.user.displayName)),
            );
            throw new BadRequestException(
              `Cannot assign users [${conflictNames.join(
                ", ",
              )}] — they already have availability in that timeframe.`,
            );
          }

          // If no conflicts, keep them for your createMany below
          candidates = parsedUserIds;
        }
      }

      // 4) Create the Project
      const newProject = await this.prisma.project.create({
        data: {
          title: body.title,
          description: body.description,
          status: body.status?.toUpperCase(),
          startDate: startDt,
          endDate: endDt,
          startWeek: startDt ? getISOWeek(startDt) : null,
          endWeek: endDt ? getISOWeek(endDt) : null,
          userId,
          companyId: body.companyId || null,
          isOrder: body.isOrder === "true" || false,
        },
      });

      // ——— NEW: assign the default checklist template ———
      const defaultTemplate = await this.prisma.checklistTemplate.findFirst({
        where: { isDefault: true },
        include: { items: true },
      });
      if (defaultTemplate) {
        // copy & re-sequence its items exactly like upsertProjectChecklist does
        const raw = defaultTemplate.items.map((i, idx) => ({ ...i, idx }));
        const withOrder = raw
          .filter((i) => i.order != null)
          .sort((a, b) => a.order - b.order || a.idx - b.idx);
        const withoutOrder = raw.filter((i) => i.order == null);
        const ordered = [...withOrder, ...withoutOrder];

        await this.prisma.projectChecklist.create({
          data: {
            projectId: newProject.id,
            templateId: defaultTemplate.id,
            userId,
            items: {
              create: ordered.map((i, idx) => ({
                templateItemId: i.id,
                order: idx + 1,
                question: i.question,
                userId, // track who seeded it
              })),
            },
          },
        });
        this.logger.log(
          `Assigned default checklist ${defaultTemplate.id} to project ${newProject.id}`,
        );
      }

      // 5) Seed assignments & availabilities in one shot
      if (candidates.length) {
        // a) assignments
        await this.prisma.projectAssignment.createMany({
          data: candidates.map((uid) => ({
            projectId: newProject.id,
            userId: uid,
          })),
          skipDuplicates: true,
        });

        // b) availabilities
        await this.prisma.availability.createMany({
          data: candidates.map((uid) => ({
            projectId: newProject.id,
            userId: uid,
            startDate: startDt,
            endDate: endDt,
            startWeek: getISOWeek(startDt),
            endWeek: getISOWeek(endDt),
          })),
          skipDuplicates: true,
        });
      }

      // 6) File handling as before…
      if (files.length) {
        for (const file of files) {
          await this.prisma.file.create({
            data: {
              projectId: newProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
              isOrder: body.isOrder === "true",
            },
          });
        }
      }

      if (body.isOrder === "true") {
        const defaultOrderFilePath = pathPosix.join(
          "uploads",
          "orders",
          "Service English.pdf",
        );
        await this.prisma.file.create({
          data: {
            projectId: newProject.id,
            filePath: defaultOrderFilePath,
            isOrder: true,
          },
        });
        this.logger.log(
          `Attached default order file to project ${newProject.id}`,
        );
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

      // 1) Load existing project dates for fallback & ensure project exists
      const existingProject = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { startDate: true, endDate: true },
      });
      if (!existingProject) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }

      // 2) Compute effective date window
      const startDt = data.startDate
        ? new Date(data.startDate)
        : existingProject.startDate;
      const endDt = data.endDate
        ? new Date(data.endDate)
        : existingProject.endDate;

      // 3) Conflict check: ensure new assignments don’t overlap other projects
      if (data.userIds && startDt && endDt) {
        const parsedUserIds: string[] = JSON.parse(data.userIds);
        if (parsedUserIds.length) {
          const conflicts = await this.prisma.availability.findMany({
            where: {
              userId: { in: parsedUserIds },
              projectId: { not: projectId },
              AND: [
                { startDate: { lte: endDt } },
                { endDate: { gte: startDt } },
              ],
            },
            select: {
              user: { select: { displayName: true } },
            },
          });

          if (conflicts.length) {
            const names = Array.from(
              new Set(conflicts.map((c) => c.user.displayName)),
            );
            throw new BadRequestException(
              `Cannot assign users [${names.join(
                ", ",
              )}] — they’re already booked in that timeframe.`,
            );
          }
        }
      }

      // 4) Build project-update payload
      const updateData: any = {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.status && { status: data.status.toUpperCase() }),
        startDate: startDt,
        endDate: endDt,
        ...(data.companyId && { companyId: data.companyId }),
        ...(data.isOrder && { isOrder: data.isOrder === "true" }),
        userId,
      };

      // 5) Apply project update
      const updatedProject = await this.prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });

      // 6) Sync all existing availabilities if dates changed
      if (data.startDate || data.endDate) {
        await this.prisma.availability.updateMany({
          where: { projectId },
          data: {
            startDate: startDt,
            endDate: endDt,
            startWeek: startDt ? getISOWeek(startDt) : null,
            endWeek: endDt ? getISOWeek(endDt) : null,
          },
        });
      }

      // 7) Handle assigned users & reconcile availability
      if (data.userIds) {
        const parsedUserIds: string[] = JSON.parse(data.userIds);

        // a) Load previous assignments
        const prev = await this.prisma.projectAssignment.findMany({
          where: { projectId },
          select: { userId: true },
        });
        const prevUserIds = prev.map((a) => a.userId);

        // b) Delete old assignments, then add new
        await this.prisma.projectAssignment.deleteMany({
          where: { projectId },
        });
        if (parsedUserIds.length) {
          await this.prisma.projectAssignment.createMany({
            data: parsedUserIds.map((uid) => ({ projectId, userId: uid })),
            skipDuplicates: true,
          });
        }

        // c) Remove availabilities for users no longer assigned
        const removed = prevUserIds.filter(
          (uid) => !parsedUserIds.includes(uid),
        );
        if (removed.length) {
          await this.prisma.availability.deleteMany({
            where: {
              projectId,
              userId: { in: removed },
            },
          });
        }

        // d) Seed availabilities for newly assigned users
        const added = parsedUserIds.filter((uid) => !prevUserIds.includes(uid));
        if (added.length && startDt && endDt) {
          await this.prisma.availability.createMany({
            data: added.map((uid) => ({
              projectId,
              userId: uid,
              startDate: startDt,
              endDate: endDt,
              startWeek: getISOWeek(startDt),
              endWeek: getISOWeek(endDt),
            })),
            skipDuplicates: true,
          });
        }
      }

      // 8) File-upload handling
      const existingFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { filePath: true },
      });
      const existingNames = existingFiles.map((f) =>
        pathPosix.basename(f.filePath),
      );
      const newFiles = files.filter((f) => !existingNames.includes(f.filename));
      if (newFiles.length) {
        for (const file of newFiles) {
          await this.prisma.file.create({
            data: {
              projectId: updatedProject.id,
              filePath: pathPosix.join("uploads", "projects", file.filename),
              isOrder: data.isOrder === "true",
            },
          });
        }
      }

      // 9) Return updated project + files
      const allFiles = await this.prisma.file.findMany({
        where: { projectId },
        select: { id: true, filePath: true, createdAt: true, updatedAt: true },
      });

      const defaultOrderFilePath = pathPosix.join(
        "uploads",
        "orders",
        "Service English.pdf",
      );
      if (data.isOrder === "true") {
                const existedOrderFile = await this.prisma.file.findFirst({
          where: {
            isOrder: true,
            filePath: defaultOrderFilePath,
            projectId,
          },
        });
        if(!existedOrderFile) {
          await this.prisma.file.create({
            data: {
              projectId: projectId,
              filePath: defaultOrderFilePath,
              isOrder: true,
            },
          });
          this.logger.log(`Attached default order file to project ${projectId}`);
        } else {
          this.logger.log(`default order file is alrady attached to project ${projectId}`);

        }
      }
      if (data.isOrder === "false") {
        const existedOrderFile = await this.prisma.file.findFirst({
          where: {
            isOrder: true,
            filePath: defaultOrderFilePath,
            projectId,
          },
        });
                if(existedOrderFile) {
        await this.prisma.file.delete({
          where: {
            id: existedOrderFile.id,
          },
        });
        this.logger.log(`default order file deleted in project ${projectId}`);
        } 
      }

      this.logger.log(`Project updated successfully: ${updatedProject.id}`);
      return {
        message: "Project updated successfully!",
        data: {
          ...updatedProject,
          files: allFiles,
        },
      };
    } catch (error) {
      // Error handling & cleanup for newly uploaded files
      this.logger.error("Failed to update project", {
        message: error.message,
        stack: error,
      });
      if (files && files.length) {
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
    isOrder: string,
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
              isOrder: isOrder === "true",
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
                },
              },
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
            title: issue.project.title,
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
      const defaultOrderFilePath = pathPosix.join(
        "uploads",
        "orders",
        "Service English.pdf",
      );

      // Delete project files from the file system, except "Service English.pdf"
      for (const file of files) {
        if (file.filePath === defaultOrderFilePath) {
          this.logger.log(`Skipping protected file: ${file.filePath}`);
          continue;
        }

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

      // Delete files from the database, except "Service English.pdf"
      await this.prisma.file.deleteMany({
        where: {
          projectId: projectId,
          NOT: {
            filePath: defaultOrderFilePath,
          },
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
          ProjectChecklist: {
            include: {
              template: true,
              User: true,
              items: {
                orderBy: { order: "asc" },
                include: {
                  attachmentFile: true,
                  user: true,
                  templateItem: true,
                },
              },
            },
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

      // === Checklist Section ===
      if (project.ProjectChecklist && project.ProjectChecklist.length > 0) {
        doc.addPage(); // Optional: separate page
        doc.fontSize(16).text("Project Checklists", { underline: true });
        doc.moveDown();

        project.ProjectChecklist.forEach((checklist, idx) => {
          doc
            .fontSize(14)
            .fillColor("black")
            .text(`Checklist ${idx + 1}: ${checklist.template.name}`);
          doc
            .fontSize(12)
            .text(`Created by: ${checklist.User?.displayName || "N/A"}`);
          doc.text(
            `Created at: ${new Date(checklist.createdAt).toLocaleString()}`,
          );
          doc.moveDown(0.5);

          checklist.items.forEach((item, iIdx) => {
            const answer =
              item.answer === true
                ? "Yes"
                : item.answer === false
                  ? "No"
                  : "Unanswered";

            doc
              .fontSize(12)
              .text(`${iIdx + 1}. ${item.question}`)
              .text(`   Answer: ${answer}`)
              .text(`   Comment: ${item.comment || "None"}`)
              .text(
                `   By: ${item.user?.displayName || "N/A"} at ${new Date(item.createdAt).toLocaleString()}`,
              );

            if (item.attachmentFile) {
              const fileName = path.basename(item.attachmentFile.filePath);
              const fileUrl = `${process.env.SERVER_URL || "http://localhost:3000"}/${item.attachmentFile.filePath}`;
              doc.fillColor("blue").text(`   Attachment: ${fileName}`, {
                link: fileUrl,
                underline: true,
              });
            }

            doc.moveDown(0.5);
          });

          doc.moveDown();
        });
      }

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
    type?: string, // "ISSUES" | "CHECKLIST"
  ) {
    try {
      const offset = (page - 1) * limit;

      const baseWhere: any = {
        NOT: {
          oldValue: null,
          newValue: null,
        },
      };

      // Apply type-specific filtering
      if (type === "ISSUES") {
        baseWhere.type = "ISSUES";
        baseWhere.issue = { projectId };
      } else if (type === "CHECKLIST") {
        baseWhere.type = "CHECKLIST";
        baseWhere.checklistItem = {
          projectChecklist: { projectId },
        };
      } else {
        // Include both types for the project
        baseWhere.OR = [
          {
            type: "ISSUES",
            issue: { projectId },
          },
          {
            type: "CHECKLIST",
            checklistItem: {
              projectChecklist: { projectId },
            },
          },
        ];
      }

      const logs = await this.prisma.issueHistory.findMany({
        where: baseWhere,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          issue: { select: { id: true, title: true } },
          checklistItem: { select: { id: true, question: true } },
        },
      });

      // Collect file references
      const fileIds = [
        ...new Set(
          logs
            .filter(
              (log) =>
                log.type === "CHECKLIST" &&
                log.fieldName === "attachmentFileId",
            )
            .flatMap((log) => [log.oldValue, log.newValue])
            .filter(Boolean),
        ),
      ];

      const fileMap = fileIds.length
        ? Object.fromEntries(
            (
              await this.prisma.checklistFile.findMany({
                where: { id: { in: fileIds } },
                select: { id: true, filePath: true },
              })
            ).map((file) => [file.id, file.filePath]),
          )
        : {};

      // Add file paths to applicable logs
      const enrichedLogs = logs.map((log) =>
        log.type === "CHECKLIST" && log.fieldName === "attachmentFileId"
          ? {
              ...log,
              oldFilePath: fileMap[log.oldValue] || null,
              newFilePath: fileMap[log.newValue] || null,
            }
          : log,
      );

      const total = await this.prisma.issueHistory.count({ where: baseWhere });

      return {
        message: "History logs fetched successfully",
        data: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          history: enrichedLogs,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch issue/checklist history logs", error);
      throw error;
    }
  }

  async assignProject(body: { projectId: string; userIds: string[] }) {
    const { projectId, userIds } = body;

    try {
      // 1) Verify project exists and grab its timeline
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { startDate: true, endDate: true },
      });
      if (!project) {
        throw new NotFoundException("Project not found");
      }
      const { startDate: startDt, endDate: endDt } = project;

      // 2) Conflict check: make sure none of these users is already booked
      if (startDt && endDt && userIds.length > 0) {
        const conflicts = await this.prisma.availability.findMany({
          where: {
            userId: { in: userIds },
            projectId: { not: projectId },
            AND: [{ startDate: { lte: endDt } }, { endDate: { gte: startDt } }],
          },
          select: {
            user: {
              select: { displayName: true },
            },
          },
        });

        if (conflicts.length) {
          const names = Array.from(
            new Set(conflicts.map((c) => c.user.displayName)),
          );
          throw new BadRequestException(
            `Cannot assign users [${names.join(
              ", ",
            )}] — they’re already booked in that timeframe.`,
          );
        }
      }

      // 3) Fetch previous assignments so we can reconcile Availability afterward
      const prev = await this.prisma.projectAssignment.findMany({
        where: { projectId },
        select: { userId: true },
      });
      const prevUserIds = prev.map((a) => a.userId);

      // 4) Delete old assignments
      await this.prisma.projectAssignment.deleteMany({
        where: { projectId },
      });

      // 5) Create new assignments
      await this.prisma.projectAssignment.createMany({
        data: userIds.map((uid) => ({
          projectId,
          userId: uid,
        })),
        skipDuplicates: true,
      });

      // 6) Reconcile Availability rows:

      // 6a) Remove availabilities for users no longer on the project
      const removed = prevUserIds.filter((uid) => !userIds.includes(uid));
      if (removed.length) {
        await this.prisma.availability.deleteMany({
          where: {
            projectId,
            userId: { in: removed },
          },
        });
      }

      // 6b) Seed availabilities for newly added users
      const added = userIds.filter((uid) => !prevUserIds.includes(uid));
      if (added.length && startDt && endDt) {
        await this.prisma.availability.createMany({
          data: added.map((uid) => ({
            projectId,
            userId: uid,
            startDate: startDt,
            endDate: endDt,
            startWeek: getISOWeek(startDt),
            endWeek: getISOWeek(endDt),
          })),
          skipDuplicates: true,
        });
      }

      this.logger.log(
        `Project ${projectId} assigned to ${userIds.length} users`,
      );
      return { message: "Project assigned successfully" };
    } catch (error) {
      this.logger.error("Failed to assign project", error);
      throw error;
    }
  }

  async removeAssignedUser(body: { projectId: string; userId: string }) {
    const { projectId, userId } = body;

    // 1) Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // 2) Verify the assignment exists
    const assignment = await this.prisma.projectAssignment.findFirst({
      where: { projectId, userId },
    });
    if (!assignment) {
      throw new BadRequestException("User is not assigned to this project");
    }

    // 3) Delete assignment + availability in one transaction
    await this.prisma.$transaction([
      this.prisma.projectAssignment.delete({
        where: {
          projectId_userId: { projectId, userId },
        },
      }),
      this.prisma.availability.deleteMany({
        where: { projectId, userId },
      }),
    ]);

    this.logger.log(
      `User ${userId} removed from project ${projectId} (and availability cleaned up)`,
    );

    return {
      message: "User successfully unassigned from the project",
    };
  }
}
