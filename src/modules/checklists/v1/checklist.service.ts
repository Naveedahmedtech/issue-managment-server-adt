import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/utils/prisma.service";
import {
  ChecklistTemplate,
  ProjectChecklist,
  ProjectChecklistItem,
  User,
} from "@prisma/client";
import { CreateChecklistTemplateDto } from "./dto/create-template.dto";
import { Request } from "express";
import { posix as pathPosix } from "path";

@Injectable()
export class ChecklistService {
  private readonly logger = new Logger(ChecklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Template methods
  async findAllTemplates(): Promise<{
    message: string;
    data: ChecklistTemplate[];
  }> {
    try {
      const templates = await this.prisma.checklistTemplate.findMany({
        where: { isDefault: true },
        include: { items: true },
      });
      this.logger.log(`Fetched ${templates.length} checklist templates`);
      return { message: "Templates fetched successfully", data: templates };
    } catch (error) {
      this.logger.error("Failed to fetch templates", error.stack);
      throw error;
    }
  }

  async createTemplate(
    req: Request & { userDetails?: User },
    dto: any,
  ): Promise<{ message: string; data: any }> {
    const { id: userId } = req.userDetails;
    try {
      const { name, description, items, isDefault } = dto;
      console.log("dto", dto);

      // assign index-based order if none provided
      const itemsToCreate = items.map((item, idx) => ({
        order: item.order ?? idx + 1,
        question: item.question,
      }));

      const template = await this.prisma.checklistTemplate.create({
        data: {
          name,
          description,
          isDefault: isDefault,
          userId,
          items: {
            create: itemsToCreate,
          },
        },
        include: { items: true },
      });

      this.logger.log(`Created checklist template ${template.id}`);
      return { message: "Template created successfully", data: template };
    } catch (error) {
      this.logger.error("Failed to create template", error.stack);
      throw error;
    }
  }

  /**
   * Upserts a checklist template by unique `name`.
   * Handles duplicate or missing orders by re-sequencing all items behind the scenes.
   */
  async upsertTemplate(
    req: Request & { userDetails?: User },
    dto: CreateChecklistTemplateDto,
  ): Promise<{ message: string; data: ChecklistTemplate }> {
    const { id: userId } = req.userDetails;
    try {
      const { name, description, isDefault, items } = dto;
      // Normalize orders: collect explicit and implicit, then re-sequence
      const rawItems = items.map((item, idx) => ({
        ...item,
        originalIndex: idx,
      }));
      const itemsWithOrder = rawItems
        .filter((item) => item.order != null)
        .sort(
          (a, b) => a.order! - b.order! || a.originalIndex - b.originalIndex,
        );
      const itemsWithoutOrder = rawItems.filter((item) => item.order == null);
      const orderedItemsList = [...itemsWithOrder, ...itemsWithoutOrder];
      const itemsToCreate = orderedItemsList.map((item, idx) => ({
        order: idx + 1,
        question: item.question,
      }));

      const template = await this.prisma.checklistTemplate.upsert({
        where: { name },
        update: {
          description,
          items: {
            deleteMany: {},
            create: itemsToCreate,
          },
        },
        create: {
          name,
          description,
          userId,
          isDefault,
          items: { create: itemsToCreate },
        },
        include: { items: true },
      });

      this.logger.log(`Upserted checklist template ${template.id}`);
      return { message: "Template upserted successfully", data: template };
    } catch (error) {
      this.logger.error("Failed to upsert template", error.stack);
      throw error;
    }
  }

  /**
   * Upserts a project checklist by (projectId, templateId).
   * Appends new template items and any user-provided items, tracking which user made them.
   */
  async upsertProjectChecklist(
    req: Request & { userDetails?: User },
    templateId: string,
    projectId: string,
    dto: any,
  ): Promise<{ message: string; data: ProjectChecklist }> {
    const { id: userId } = req.userDetails;

    try {
      const { items: userItems = [] } = dto;

      // Load template and existing checklist
      const [template, existing] = await Promise.all([
        this.prisma.checklistTemplate.findUnique({
          where: { id: templateId },
          include: { items: true },
        }),
        this.prisma.projectChecklist.findUnique({
          where: { projectId_templateId: { projectId, templateId } },
          include: { items: true },
        }),
      ]);
      if (!template)
        throw new NotFoundException(`Template ${templateId} not found`);

      // Normalize and sort template items
      const rawTemplate = template.items.map((item, idx) => ({
        ...item,
        originalIndex: idx,
      }));
      const templWithOrder = rawTemplate
        .filter((i) => i.order != null)
        .sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex);
      const templWithoutOrder = rawTemplate.filter((i) => i.order == null);
      const orderedTemplate = [...templWithOrder, ...templWithoutOrder];
      const templateToCreate = orderedTemplate.map((i, idx) => ({
        templateItemId: i.id,
        order: idx + 1,
        question: i.question,
        userId,
      }));

      if (!existing) {
        // Create new checklist: combine template and user items
        const combined = [...templateToCreate];
        userItems.forEach((ui) => {
          combined.push({
            templateItemId: null,
            order: combined.length + 1,
            question: ui.question,
            userId,
          });
        });

        const created = await this.prisma.projectChecklist.create({
          data: {
            projectId,
            templateId,
            items: { create: combined },
          },
          include: { items: true },
        });
        this.logger.log(`Created project checklist ${created.id}`);
        return {
          message: "Project checklist created successfully",
          data: created,
        };
      }

      // Existing checklist: append only new template items first
      const checklistId = existing.id;
      const existingTemplIds = new Set(
        existing.items.map((i) => i.templateItemId),
      );
      let nextOrder = existing.items.length;
      const newTemplForAppend = orderedTemplate.filter(
        (i) => !existingTemplIds.has(i.id),
      );
      for (const ti of newTemplForAppend) {
        nextOrder++;
        await this.prisma.projectChecklistItem.create({
          data: {
            projectChecklistId: checklistId,
            templateItemId: ti.id,
            order: nextOrder,
            question: ti.question,
            userId,
          },
        });
      }

      // Then append any user-provided items
      for (const ui of userItems) {
        nextOrder++;
        await this.prisma.projectChecklistItem.create({
          data: {
            projectChecklistId: checklistId,
            templateItemId: null,
            order: nextOrder,
            question: ui.question,
            userId,
          },
        });
      }

      // Reload full checklist
      const updated = await this.prisma.projectChecklist.findUnique({
        where: { projectId_templateId: { projectId, templateId } },
        include: {
          items: {
            orderBy: { order: "asc" },
          },
        },
      });
      this.logger.log(`Updated project checklist ${updated.id}`);
      return {
        message: "Project checklist updated successfully",
        data: updated,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upsert project checklist for project ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }

  async findProjectChecklists(
    projectId: string,
  ): Promise<{ message: string; data: ProjectChecklist[] }> {
    try {
      const checklists = await this.prisma.projectChecklist.findMany({
        where: { projectId },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              isDefault: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      this.logger.log(
        `Fetched ${checklists.length} project checklists for project ${projectId}`,
      );
      return {
        message: "Project checklists fetched successfully",
        data: checklists,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch project checklists for project ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }

  async findProjectChecklistById(
    projectId: string,
    checklistId: string,
  ): Promise<{
    message: string;
    data: ProjectChecklist & { items: ProjectChecklistItem[] };
  }> {
    try {
      const checklist = await this.prisma.projectChecklist.findUnique({
        where: { id: checklistId },
        include: {
          template: { select: { id: true, name: true, description: true } },
          items: {
            orderBy: { order: "asc" },
            include: {
              attachmentFile: {
                select: {
                  id: true,
                  filePath: true,
                },
              },
            },
          },
        },
      });
      if (!checklist || checklist.projectId !== projectId) {
        throw new NotFoundException(
          `Checklist ${checklistId} for project ${projectId} not found`,
        );
      }
      this.logger.log(
        `Fetched checklist ${checklistId} for project ${projectId}`,
      );
      return {
        message: "Project checklist fetched successfully",
        data: checklist,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch checklist ${checklistId} for project ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }

  // Update single item
  async updateChecklistItem(
    req: Request & { userDetails?: User },

    projectId: string,
    checklistId: string,
    itemId: string,
    dto: any,
  ): Promise<{ message: string; data: ProjectChecklistItem }> {
    const { id: userId } = req.userDetails;

    try {
      const it = await this.prisma.projectChecklistItem.findUnique({
        where: { id: itemId },
        include: { projectChecklist: true },
      });
      if (
        !it ||
        it.projectChecklist.projectId !== projectId ||
        it.projectChecklistId !== checklistId
      ) {
        throw new NotFoundException(`Item ${itemId} not found`);
      }
      const updated = await this.prisma.projectChecklistItem.update({
        where: { id: itemId },
        data: {
          ...(dto.answer !== undefined && { answer: dto.answer }),
          ...(dto.comment !== undefined && { comment: dto.comment }),
          ...(dto.attachmentFileId !== undefined && {
            attachmentFileId: dto.attachmentFileId,
            userId,
          }),
        },
      });
      this.logger.log(`Updated item ${itemId}`);
      return { message: "Checklist item updated successfully", data: updated };
    } catch (error) {
      this.logger.error(`Failed to update item ${itemId}`, error.stack);
      throw error;
    }
  }

  async uploadFiles(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
    projectId: string,
    checklistItemId: string,
  ) {
    try {
      // 1) No files? Exit early
      if (!files || files.length === 0) {
        return { message: "No files provided" };
      }

      // 2) Validate project
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }

      // 3) Validate checklist item
      const checklistItem = await this.prisma.projectChecklistItem.findUnique({
        where: { id: checklistItemId },
      });
      if (!checklistItem || checklistItem.projectChecklistId === null) {
        throw new NotFoundException(
          `Checklist item ${checklistItemId} not found`,
        );
      }

      // 4) Insert checklist file(s) and associate first one with the checklist item
      const createdFiles = [];
      for (const file of files) {
        const created = await this.prisma.checklistFile.create({
          data: {
            projectId,
            filePath: pathPosix.join(
              "uploads",
              "projects",
              "checklist",
              file.filename,
            ),
          },
        });
        createdFiles.push(created);

        // Associate the first uploaded file with the checklist item
        if (createdFiles.length === 1) {
          await this.prisma.projectChecklistItem.update({
            where: { id: checklistItemId },
            data: {
              attachmentFileId: created.id,
            },
          });
        }
      }

      this.logger.log(
        `Uploaded ${createdFiles.length} checklist file(s) to project ${projectId}, linked 1 to item ${checklistItemId}`,
      );

      return {
        message: "Checklist files uploaded and linked",
        count: createdFiles.length,
        createdFiles,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload checklist files for project ${projectId}`,
        error,
      );
      throw error;
    }
  }

  async deleteProjectChecklistItem(
    projectId: string,
    checklistId: string,
    itemId: string,
  ): Promise<{ message: string }> {
    try {
      // 1. Find the item with related checklist and project
      const item = await this.prisma.projectChecklistItem.findUnique({
        where: { id: itemId },
        include: {
          projectChecklist: true,
        },
      });

      // 2. Check if it exists and belongs to correct checklist/project
      if (
        !item ||
        item.projectChecklistId !== checklistId ||
        item.projectChecklist.projectId !== projectId
      ) {
        throw new NotFoundException(
          `Item ${itemId} not found in checklist ${checklistId} of project ${projectId}`,
        );
      }

      // 3. Perform the delete
      await this.prisma.projectChecklistItem.delete({
        where: { id: itemId },
      });

      this.logger.log(
        `Deleted item ${itemId} from checklist ${checklistId} for project ${projectId}`,
      );

      return {
        message: `Checklist item ${itemId} deleted successfully`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to delete item ${itemId} from checklist ${checklistId} in project ${projectId}`,
        error.stack,
      );
      throw error;
    }
  }
}
