import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body, UseGuards,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {AuthGuard} from "../../../guards/auth.guard";
import {RolesAndPermissions} from "../../../utils/roleAndPermission.decorator";
import {PERMISSIONS, ROLES} from "../../../constants/roles-permissions.constants";

@Controller({ path: 'role', version: '1' })
@UseGuards(AuthGuard)
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_ROLES])
    async getAllRoles() {
        return await this.roleService.getAllRoles();
    }

    @Post()
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_ROLES])
    async createRole(@Body() body: CreateRoleDto) {
        return await this.roleService.createRole(body);
    }

    @Put(':id')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_ROLES])
    async updateRole(
        @Param('id') id: string,
        @Body() body: UpdateRoleDto,
    ) {
        return await this.roleService.updateRole(id, body);
    }

    @Delete(':id')
    @RolesAndPermissions([ROLES.SUPER_ADMIN], [PERMISSIONS.USER_MANAGEMENT.MANAGE_ROLES])
    async deleteRole(@Param('id') id: string) {
        return await this.roleService.deleteRole(id);
    }
}
