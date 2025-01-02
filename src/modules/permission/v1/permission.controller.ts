import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
} from '@nestjs/common';
import { PermissionService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Controller({ path: 'permission', version: '1' })
export class PermissionController {
    constructor(private readonly permissionService: PermissionService) {}

    @Get()
    async getAllPermissions() {
        return await this.permissionService.getAllPermissions();
    }

    @Get(':id')
    async getPermissionById(@Param('id') id: string) {
        return await this.permissionService.getPermissionById(id);
    }

    @Post()
    async createPermission(@Body() body: CreatePermissionDto) {
        return await this.permissionService.createPermission(body);
    }

    @Put(':id')
    async updatePermission(
        @Param('id') id: string,
        @Body() body: UpdatePermissionDto,
    ) {
        return await this.permissionService.updatePermission(id, body);
    }

    @Delete(':id')
    async deletePermission(@Param('id') id: string) {
        return await this.permissionService.deletePermission(id);
    }
}
