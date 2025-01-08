import {
    Body,
    Controller,
    Post,
    Req,
    UseGuards,
    UploadedFiles,
  } from "@nestjs/common";
  import { IssueService } from "./issue.service";
  import { Request } from "express";
  import { AuthGuard } from "src/guards/auth.guard";
  import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";
  import { RolesAndPermissions } from "src/utils/roleAndPermission.decorator";
  import { PERMISSIONS, ROLES } from "src/constants/roles-permissions.constants";

  
  @Controller({ path: "issue", version: "1" })
  @UseGuards(AuthGuard)
  export class IssueController {
    constructor(private readonly issueService: IssueService) {}
  
    @Post('create')
    @FileUploadInterceptor("./uploads/issues", 10)
    @RolesAndPermissions(
      [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      [PERMISSIONS.PROJECT.READ],
    )
    async createIssue(
      @Req() req: Request,
      @Body() data: any,
      @UploadedFiles() files: Array<Express.Multer.File>,
    ) {
      return await this.issueService.createIssue(req, files);
    }
  
  }
  