import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller({ path: 'role', version: '1' })
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @Get()
    async getAllRoles() {
        return await this.roleService.getAllRoles();
    }

    @Post()
    async createRole(@Body() body: CreateRoleDto) {
        return await this.roleService.createRole(body);
    }

    @Put(':id')
    async updateRole(
        @Param('id') id: string,
        @Body() body: UpdateRoleDto,
    ) {
        return await this.roleService.updateRole(id, body);
    }

    @Delete(':id')
    async deleteRole(@Param('id') id: string) {
        return await this.roleService.deleteRole(id);
    }
}
