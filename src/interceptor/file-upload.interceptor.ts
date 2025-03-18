import { applyDecorators, UseInterceptors, Logger } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, basename } from "path";
import * as fs from "fs";

export function FileUploadInterceptor(destinationPath: string, maxFiles = 10) {
  const logger = new Logger("FileUploadInterceptor");
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor("files", maxFiles, {
        storage: diskStorage({
          destination: (req, file, callback) => {
            callback(null, destinationPath);
          },
          filename: async (req, file, callback) => {
            console.log(file)
            const fileExtName = extname(file.originalname);
            const fileNameWithoutExt = basename(file.originalname, fileExtName);

            const finalFileName = `${fileNameWithoutExt}${fileExtName}`;

            // Unlink (delete) the old file if it exists
            const existingFilePath = `${destinationPath}/${finalFileName}`;
            if (fs.existsSync(existingFilePath)) {
              try {
                fs.unlinkSync(existingFilePath);
                logger.log(`Deleted existing file: ${existingFilePath}`);
              } catch (error) {
                logger.error(
                  `Failed to delete existing file: ${existingFilePath}`,
                  error,
                );
              }
            }

            callback(null, finalFileName);
          },
        }),
      }),
    ),
  );
}
