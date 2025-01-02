import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body, UseGuards,
} from '@nestjs/common';
import { PermissionService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {AuthGuard} from "../../../guards/auth.guard";
import {RolesAndPermissions} from "../../../utils/roleAndPermission.decorator";
import {PERMISSIONS, ROLES} from "../../../constants/roles-permissions.constants";

@Controller({ path: 'permission', version: '1' })
@UseGuards(AuthGuard)
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) {}


    @Post('bulk')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async createPermissionsBulk(@Body() permissions: { action: string; description?: string }[]) {
        return await this.permissionService.createPermissionsBulk(permissions);
    }


    @Get()
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async getAllPermissions() {
        return await this.permissionService.getAllPermissions();
    }

    @Get(':id')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async getPermissionById(@Param('id') id: string) {
        return await this.permissionService.getPermissionById(id);
    }

    @Post()
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async createPermission(@Body() body: CreatePermissionDto) {
        return await this.permissionService.createPermission(body);
    }

    @Put(':id')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async updatePermission(
        @Param('id') id: string,
        @Body() body: UpdatePermissionDto,
    ) {
        return await this.permissionService.updatePermission(id, body);
    }

    @Delete(':id')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_PERMISSIONS])
    async deletePermission(@Param('id') id: string) {
        return await this.permissionService.deletePermission(id);
    }
}
