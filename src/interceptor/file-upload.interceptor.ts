import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

export function FileUploadInterceptor(destinationPath: string, maxFiles = 10) {
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor('files', maxFiles, {
        storage: diskStorage({
          destination: destinationPath,
          filename: (req, file, callback) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const fileExtName = extname(file.originalname);
            callback(null, `${file.fieldname}-${uniqueSuffix}${fileExtName}`);
          },
        }),
      }),
    ),
  );
}
