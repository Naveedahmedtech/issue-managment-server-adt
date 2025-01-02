import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {RoleController} from "./modules/role/v1/role.controller";
import {RoleModule} from "./modules/role/v1/role.module";
import {LoggerModule} from "./logger.module";
import {PermissionModule} from "./modules/permission/v1/premission.module";
import {UserModule} from "./modules/user/v1/user.module";

@Module({
  imports: [RoleModule, LoggerModule, PermissionModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
