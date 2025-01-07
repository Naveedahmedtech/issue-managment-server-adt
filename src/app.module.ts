import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {RoleModule} from "./modules/role/v1/role.module";
import {PermissionModule} from "./modules/permission/v1/premission.module";
import {UserModule} from "./modules/user/v1/user.module";
import {SharedModule} from "./common/shared.module";
import { ProjectModule } from './modules/project/v1/project.module';



@Module({
  imports: [
    SharedModule, RoleModule, PermissionModule, UserModule, ProjectModule],
  controllers: [AppController],
  providers: [AppService],
  exports: [],
})
export class AppModule {}