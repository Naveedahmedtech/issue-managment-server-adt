import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UploadedFiles,
  Put,
  Param,
  Delete,
} from "@nestjs/common";
import { IssueService } from "./issue.service";
import { Request } from "express";
import { AuthGuard } from "src/guards/auth.guard";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";
import { RolesAndPermissions } from "src/utils/roleAndPermission.decorator";
import {  ROLES } from "src/constants/roles-permissions.constants";

// TODO: Add a check to only allow update issue who created (WORKERS)

@Controller({ path: "issue", version: "1" })
@UseGuards(AuthGuard)
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Post("create")
  @FileUploadInterceptor("./uploads/issues", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
  )
  async createIssue(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.issueService.createIssue(req, files);
  }

  @Put(":id")
  @FileUploadInterceptor("./uploads/issues", 10)
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER],
  )
  async updateIssue(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.issueService.updateIssue(id, req, files);
  }

  @Delete(":issueId")
  @RolesAndPermissions(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  )
  async deleteIssue(@Param("issueId") issueId: string) {
    return await this.issueService.deleteIssue(issueId);
  }
}
