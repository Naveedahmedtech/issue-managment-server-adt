import { applyDecorators, UseInterceptors, Logger } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, basename } from "path";
import * as fs from "fs";

export function FileUploadInterceptor(destinationPath: string, maxFiles = 10, maxFileSizeMB = 100) {
  const logger = new Logger("FileUploadInterceptor");
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
            const finalFileName = `${fileNameWithoutExt}${fileExtName}`;

            const existingFilePath = `${destinationPath}/${finalFileName}`;
            if (fs.existsSync(existingFilePath)) {
              try {
                // Uncomment if you want to overwrite:
                // fs.unlinkSync(existingFilePath);
                // logger.log(`Deleted existing file: ${existingFilePath}`);
              } catch (error) {
                logger.error(`Failed to delete existing file: ${existingFilePath}`, error);
              }
            }

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

