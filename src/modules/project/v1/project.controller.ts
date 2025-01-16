import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UploadedFiles,
  Param,
  Put,
  Query,
  Get,
  Delete,
  Res,
  Patch,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { Request, Response } from "express";
import { AuthGuard } from "src/guards/auth.guard";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";
import { RolesAndPermissions } from "src/utils/roleAndPermission.decorator";
import { ROLES } from "src/constants/roles-permissions.constants";
import { User } from "@prisma/client";

@Controller({ path: "project", version: "1" })
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async createProject(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.createProject(req, files);
  }

  @Put(":id")
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async updateProject(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.updateProject(id, req, files);
  }

  @Put(":fileId/update-file")
  @FileUploadInterceptor("./uploads/updatedFiles", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async updateFile(
    @Param("fileId") fileId: string,
    @Body() data: any,
    @UploadedFiles() files: Express.Multer.File,
  ) {
    return await this.projectService.updateFile(
      { projectId: data?.projectId, issueId: data?.issueId, fileId },
      files,
    );
  }

  @Post(":projectId/files")
  @FileUploadInterceptor("./uploads/projects", 10) // Upload up to 10 files to the 'projects' directory
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async uploadFilesToProject(
    @Req() req: Request,
    @Param("projectId") projectId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.uploadFilesToProject(projectId, files);
  }

  @Patch(":projectId/toggle-archive")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async toggleArchiveProject(
    @Param("projectId") projectId: string,
  ) {
    return await this.projectService.toggleArchiveProject(projectId);
  }

  @Get()
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjects(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.projectService.getProjects(pageNumber, limitNumber);
  }

  @Get("list")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjectList(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.projectService.getProjectList(pageNumber, limitNumber);
  }

  @Get("archived")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getArchivedProjectList(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.projectService.getArchivedProjectList(pageNumber, limitNumber);
  }

  @Get(":projectId")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getById(@Param("projectId") projectId: string) {
    return this.projectService.getById(projectId);
  }

  @Get(":projectId/files")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjectFiles(
    @Param("projectId") projectId: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return this.projectService.getAllProjectFiles(
      projectId,
      pageNumber,
      limitNumber,
    );
  }

  @Get(":projectId/issues")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getProjectIssues(@Param("projectId") projectId: string) {
    return await this.projectService.getProjectIssues(projectId);
  }

  @Delete(":projectId")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async deleteProject(
    @Param("projectId") projectId: string,
    @Req() req: Request & { userDetails?: User },
  ) {
    return await this.projectService.deleteProject(projectId, req);
  }

  @Get("dashboard/stats")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getProjectStats() {
    return await this.projectService.getProjectStats();
  }

  @Get("dashboard/recent")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getRecentProjects(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return await this.projectService.getRecentProjects(pageNumber, limitNumber);
  }

  @Get(":projectId/generate-report")
  async downloadProjectReport(
    @Res() res: Response,
    @Param("projectId") projectId: string,
    @Query("status") status?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const filters: any = {};

    // Apply filters if present
    if (status) filters.status = status;
    if (startDate) filters.startDate = { gte: new Date(startDate) };
    if (endDate) filters.endDate = { lte: new Date(endDate) };

    // Generate the PDF report
    return await this.projectService.generateProjectReport(
      res,
      projectId,
      filters,
    );
  }

  @Get("files/:fileId/download")
  async downloadFile(
    @Res() res: Response,
    @Param("fileId") fileId: string,
    @Query("type") type: 'project' | 'issue',
  ) {
    // Generate the PDF report
    return await this.projectService.downloadFile(
      fileId,
      type,
    );
  }
}
