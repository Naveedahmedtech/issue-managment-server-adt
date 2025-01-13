import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { RoleModule } from "./modules/role/v1/role.module";
import { PermissionModule } from "./modules/permission/v1/premission.module";
import { UserModule } from "./modules/user/v1/user.module";
import { SharedModule } from "./common/shared.module";
import { ProjectModule } from "./modules/project/v1/project.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { IssueModule } from "./modules/issue/v1/issue.module";
import { OrderModule } from "./modules/order/v1/order.module";

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "uploads"),
      serveRoot: "/uploads",
    }),
    SharedModule,
    RoleModule,
    PermissionModule,
    UserModule,
    ProjectModule,
    IssueModule,
    OrderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [],
})
export class AppModule {}
