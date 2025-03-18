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
import { PERMISSIONS, ROLES } from "src/constants/roles-permissions.constants";
// import { User } from "@prisma/client";
import { ValidationUtils } from "src/utils/validation.utils";
import { normalizeKeys } from "src/utils/common";

@Controller({ path: "project", version: "1" })
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.CREATE],
  )
  async createProject(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    ValidationUtils.validateRequiredString(data.title, "Title");
    ValidationUtils.validateRequiredString(data.status, "Status");
    data.status = ValidationUtils.toUpperCase(data.status);

    const startDate = ValidationUtils.validateOptionalDate(
      data.startDate,
      "Start Date",
    );
    const endDate = ValidationUtils.validateOptionalDate(
      data.endDate,
      "End Date",
    );
    if (startDate && endDate) {
      ValidationUtils.validateDateRange(startDate, endDate);
    }

    ValidationUtils.validateOptionalString(data.companyName, "Company Name");

    return await this.projectService.createProject(req, files, data);
  }

  @Put(":id")
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.EDIT],
  )
  async updateProject(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    console.log("data", data);
    const normalizedData = normalizeKeys(data) as any;
    ValidationUtils.validateRequiredString(normalizedData.title, "title");
    ValidationUtils.validateRequiredString(normalizedData.status, "status");
    data.status = ValidationUtils.toUpperCase(normalizedData.status);

    const startDate = ValidationUtils.validateOptionalDate(
      normalizedData.startDate,
      "startDate",
    );
    const endDate = ValidationUtils.validateOptionalDate(
      normalizedData.endDate,
      "endDate",
    );
    if (startDate && endDate) {
      ValidationUtils.validateDateRange(startDate, endDate);
    }
    ValidationUtils.validateOptionalString(
      normalizedData.companyName,
      "companyName",
    );
    ValidationUtils.validateOptionalString(
      normalizedData.description,
      "description",
    );
    return await this.projectService.updateProject(
      id,
      req,
      files,
      normalizedData,
    );
  }

  @Put(":fileId/update-file")
  @FileUploadInterceptor("./uploads/projects", 10)
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
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
  )
  async uploadFilesToProject(
    @Req() req: Request,
    @Param("projectId") projectId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.uploadFilesToProject(projectId, files);
  }

  @Patch(":projectId/toggle-archive")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async toggleArchiveProject(@Param("projectId") projectId: string) {
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

  @Get("all-issues")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjectIssues(
    @Query("userId") userId: string,
  ) {

    return this.projectService.getAllProjectIssues(userId);
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
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.DELETE],
  )
  async deleteProject(
    @Param("projectId") projectId: string,
    // @Req() req: Request & { userDetails?: User },
  ) {
    return await this.projectService.deleteProject(projectId);
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
    @Query("search") search: string,
    @Query("sortOrder") sortOrder: "asc" | "desc",
    @Query("status") status: string,
    @Query("endDate") endDate: string,
    @Query("startDate") startDate: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return await this.projectService.getRecentProjects(
      pageNumber,
      limitNumber,
      search,
      status,
      startDate,
      endDate,
      sortOrder,
    );
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
    @Query("type") type: "project" | "issue",
  ) {
    // Generate the PDF report
    return await this.projectService.downloadFile(fileId, type);
  }

  @Patch("issues/:issueId/update-log-history")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async updateIssue(
    @Param("issueId") issueId: string,
    @Body()
    updateData: Array<{
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }>,
    @Req() req: Request,
  ) {
    return await this.projectService.updateIssueLogHistory(
      req,
      issueId,
      updateData,
    );
  }

  @Get(":projectId/activity-logs")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getIssueHistory(
    @Param("projectId") projectId: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Query("issueId") issueId: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return await this.projectService.getIssuesHistory(
      projectId,
      pageNumber,
      limitNumber,
      issueId,
    );
  }

  @Post('assign-to-users')
  async assignProject(@Body() body: {projectId: string; userIds: string[]}) {
    return this.projectService.assignProject(body);
  }

  @Post('unassign-to-users')
  async removeAssignedUser(@Body() body: {projectId: string; userId: string}) {
    return this.projectService.removeAssignedUser(body);
  }
}
