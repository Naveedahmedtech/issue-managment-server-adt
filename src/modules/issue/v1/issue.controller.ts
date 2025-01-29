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
import { PERMISSIONS, ROLES } from "src/constants/roles-permissions.constants";


@Controller({ path: "issue", version: "1" })
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Post("create")
  async createIssue(
    @Body() data: {
      title: string;
      description: string;
      status: string;
      startDate: string;
      endDate: string;
      projectId: string;
      userId: string;
    },
  ) {
    return await this.issueService.createIssue(data);
  }

  @UseGuards(AuthGuard)
  @Put(":id")
  @FileUploadInterceptor("./uploads/issues", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER], [PERMISSIONS.ISSUE.EDIT])
  async updateIssue(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.issueService.updateIssue(id, req, files);
  }

  @UseGuards(AuthGuard)
  @Delete(":issueId")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async deleteIssue(@Param("issueId") issueId: string) {
    return await this.issueService.deleteIssue(issueId);
  }
}
