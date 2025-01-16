import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const ctx = context.switchToHttp();
      const response = ctx.getResponse();

      const statusCode = response.statusCode;

      return next.handle().pipe(
          map((data) => {
              if(data.message === "REDIRECT_TO_APPLICATION") {
                  return response.redirect(data.data.redirectURI)
              } else if(data.message === "PDF_GENERATED") {
                response.set({
                  "Content-Type": "application/pdf",
                  "Content-Disposition": `attachment; filename="Project_Report_${data?.projectId}.pdf"`,
                });
                return response.send(data?.data)
              } else if (data.message === "DOWNLOAD_FILE") {
                return response.download(data?.data?.filePath)
              } else {
                  return {
                      status: 'success',
                      message: data.message || 'Operation completed successfully',
                      data: data.data !== undefined ? data.data : data,
                      statusCode,
                      timestamp: new Date().toISOString(),
                  }
              }
          }),
      );
  }
}
