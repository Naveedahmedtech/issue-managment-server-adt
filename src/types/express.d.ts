import { User } from '@prisma/client';

declare namespace Express {
    export interface Request {
        user?: {
            sub: string;
            email: string;
            name: string;
        };
        userDetails?: User;
    }
    export namespace Multer {
        export interface File {
          fieldname: string;
          originalname: string;
          encoding: string;
          mimetype: string;
          size: number;
          destination: string;
          filename: string;
          path: string;
          buffer: Buffer;
        }
      }
}
