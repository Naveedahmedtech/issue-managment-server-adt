import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  UploadedFiles,
  Delete,
} from "@nestjs/common";
import { ChecklistService } from "./checklist.service";
import { Request } from "express";
import { AuthGuard } from "src/guards/auth.guard";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";

@Controller({ path: "checklist-templates", version: "1" })
@UseGuards(AuthGuard)
export class ChecklistTemplateController {
  constructor(private readonly svc: ChecklistService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: any) {
    return this.svc.upsertTemplate(req, dto);
  }

  @Post("/:templateId/:projectId")
  upsertProjectChecklist(
    @Req() req: Request,
    @Body() dto: any,
    @Param("templateId") templateId: string,
    @Param("projectId") projectId: string,
  ) {
    return this.svc.upsertProjectChecklist(req, templateId, projectId, dto);
  }

  @Post("/:projectId/projects/:checklistId/:itemId")
  saveAnswerToChecklist(
    @Req() req: Request,
    @Body() dto: any,
    @Param("checklistId") checklistId: string,
    @Param("itemId") itemId: string,
    @Param("projectId") projectId: string,
  ) {
    return this.svc.updateChecklistItem(
      req,
      projectId,
      checklistId,
      itemId,
      dto,
    );
  }

  // @Post()
  // create(@Req() req: Request, @Body() dto: CreateChecklistTemplateDto) {
  //   return this.svc.upsertTemplate(req, dto);
  // }

  @Get()
  findAll() {
    return this.svc.findAllTemplates();
  }

  @Get("/:projectId/projects")
  findAllProjectTemplates(@Param("projectId") projectId: string) {
    return this.svc.findProjectChecklists(projectId);
  }

  @Get("/:projectId/projects/:checklistId")
  findAllProjectChecklist(
    @Param("projectId") projectId: string,
    @Param("checklistId") checklistId: string,
  ) {
    return this.svc.findProjectChecklistById(projectId, checklistId);
  }

  @Post("/:projectId/upload/:checklistItemId")
  @FileUploadInterceptor("./uploads/projects/checklist", 10)
  async uploadFiles(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Param("projectId") projectId: string,
    @Param("checklistItemId") checklistItemId: string,
  ) {
    return await this.svc.uploadFiles(req, files, projectId,checklistItemId);
  }


  
  @Delete("/:projectId/projects/:checklistId/item/:itemId")
  deleteProjectChecklistItem(
    @Param("projectId") projectId: string,
    @Param("checklistId") checklistId: string,
    @Param("itemId") itemId: string,
  ) {
    return this.svc.deleteProjectChecklistItem(projectId, checklistId, itemId);
  }

}
