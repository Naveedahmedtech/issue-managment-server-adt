import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, basename } from 'path';

export function FileUploadInterceptor(destinationPath: string, maxFiles = 10) {
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor('files', maxFiles, {
        storage: diskStorage({
          destination: destinationPath,
          filename: (req, file, callback) => {
            const fileExtName = extname(file.originalname);
            const fileNameWithoutExt = basename(file.originalname, fileExtName);
            
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const finalFileName = `${fileNameWithoutExt}-${uniqueSuffix}${fileExtName}`;
            
            callback(null, finalFileName);
          },
        }),
      }),
    ),
  );
}
