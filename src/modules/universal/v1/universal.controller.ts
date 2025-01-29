import { Controller, Param, Put, Query, UploadedFiles } from "@nestjs/common";
import { UniversalService } from "./universal.service";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";

@Controller({ path: "universal", version: "1" })
export class UniversalController {
  constructor(private readonly universalService: UniversalService) {}

  @Put("upload/:id")
  @FileUploadInterceptor("./uploads/projects", 10)
  async updateProject(
    @Param("id") id: string,
    @Query("userId") userId: string,
    @UploadedFiles() files: Express.Multer.File,
  ) {
    const params = { fileId: id, userId };
    return await this.universalService.updateFile(params, files);
  }
}
