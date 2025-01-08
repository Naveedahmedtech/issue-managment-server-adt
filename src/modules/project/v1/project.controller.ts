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
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { Request } from "express";
import { AuthGuard } from "src/guards/auth.guard";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";
import { RolesAndPermissions } from "src/utils/roleAndPermission.decorator";
import { PERMISSIONS, ROLES } from "src/constants/roles-permissions.constants";
import { User } from "@prisma/client";

@Controller({ path: "project", version: "1" })
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.READ],
  )
  async createProject(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.createProject(req, files);
  }

  @Put(":id")
  @FileUploadInterceptor("./uploads/projects", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.READ],
  )
  async updateProject(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.updateProject(id, req, files);
  }

  @Post(":projectId/files")
  @FileUploadInterceptor("./uploads/projects", 10) // Upload up to 10 files to the 'projects' directory
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.EDIT],
  )
  async uploadFilesToProject(
    @Req() req: Request,
    @Param("projectId") projectId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.projectService.uploadFilesToProject(projectId, files);
  }

  @Get()
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
    [PERMISSIONS.PROJECT.READ],
  )
  async getAllProjects(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.projectService.getProjects(pageNumber, limitNumber);
  }

  @Get("list")
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
    [PERMISSIONS.PROJECT.READ],
  )
  async getAllProjectList(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.projectService.getProjectList(pageNumber, limitNumber);
  }

  @Get(":projectId")
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
    [PERMISSIONS.PROJECT.READ],
  )
  async getById(@Param("projectId") projectId: string) {
    return this.projectService.getById(projectId);
  }

  @Get(":projectId/files")
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
    [PERMISSIONS.PROJECT.READ],
  )
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

  @Get(':projectId/issues')
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.READ],
  )
  async getProjectIssues(@Param('projectId') projectId: string) {
    return await this.projectService.getProjectIssues(projectId);
  }

  @Delete(":projectId")
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    [PERMISSIONS.PROJECT.READ],
  )
  async deleteProject(
    @Param("projectId") projectId: string,
    @Req() req: Request & { userDetails?: User },
  ) {
    return await this.projectService.deleteProject(projectId, req);
  }
}
