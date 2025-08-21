import { applyDecorators, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, basename } from "path";
// import * as fs from "fs";


export function FileUploadInterceptor(destinationPath: string, maxFiles = 10, maxFileSizeMB = 100) {
  // const logger = new Logger("FileUploadInterceptor");
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor("files", maxFiles, {
        storage: diskStorage({
          destination: (req, file, callback) => {
            callback(null, destinationPath);
          },
          filename: async (req, file, callback) => {
  const fileExtName = extname(file.originalname);
  const fileNameWithoutExt = basename(file.originalname, fileExtName);

  // generate a short unique code (1000–99999)
  const uniqueSuffix = Math.floor(1000 + Math.random() * 90000);
  const finalFileName = `${fileNameWithoutExt}-${uniqueSuffix}${fileExtName}`;

  callback(null, finalFileName);
          },
        }),
        limits: {
          fileSize: maxFileSizeMB * 1024 * 1024, // e.g. 5 MB default
        },
      }),
    ),
  );
}

