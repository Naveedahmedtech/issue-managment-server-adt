import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../utils/prisma.service';

@Injectable()
export class PermissionService {
    private readonly logger = new Logger(PermissionService.name);

    constructor(private readonly prisma: PrismaService) {}


    async createPermissionsBulk(permissions: { action: string; description?: string }[]) {
        try {
            const createdPermissions = await this.prisma.permission.createMany({
                data: permissions,
                skipDuplicates: true, // Avoid duplicates if Prisma supports it
            });

            this.logger.log(`Permissions created successfully: ${createdPermissions.count} items`);
            return {
                message: 'Permissions created successfully',
                data: createdPermissions,
            };
        } catch (error) {
            this.logger.error('Failed to create permissions in bulk', error);
            throw error;
        }
    }


    async getAllPermissions() {
        try {
            const permissions = await this.prisma.permission.findMany();
            this.logger.log('Fetched all permissions successfully');
            return {
                message: 'Permissions fetched successfully',
                data: permissions,
            };
        } catch (error) {
            this.logger.error('Failed to fetch permissions', error);
            throw error;
        }
    }

    async getPermissionById(id: string) {
        try {
            const permission = await this.prisma.permission.findUnique({
                where: { id },
            });
            if (!permission) {
                this.logger.warn(`Permission with ID ${id} not found`);
                throw new Error(`Permission with ID ${id} not found`);
            }
            this.logger.log(`Fetched permission with ID ${id} successfully`);
            return {
                message: 'Permission fetched successfully',
                data: permission,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch permission with ID ${id}`, error);
            throw error;
        }
    }

    async createPermission(data: { action: string; description?: string }) {
        try {
            const permission = await this.prisma.permission.create({ data });
            this.logger.log(`Permission created successfully: ${permission.action}`);
            return {
                message: 'Permission created successfully',
                data: permission,
            };
        } catch (error) {
            this.logger.error(`Failed to create permission: ${data.action}`, error);
            throw error;
        }
    }

    async updatePermission(id: string, data: { action?: string; description?: string }) {
        try {
            const permission = await this.prisma.permission.update({
                where: { id },
                data,
            });
            this.logger.log(`Permission with ID ${id} updated successfully`);
            return {
                message: 'Permission updated successfully',
                data: permission,
            };
        } catch (error) {
            this.logger.error(`Failed to update permission with ID ${id}`, error);
            throw error;
        }
    }

    async deletePermission(id: string) {
        try {
            await this.prisma.permission.delete({
                where: { id },
            });
            this.logger.log(`Permission with ID ${id} deleted successfully`);
            return {
                message: 'Permission deleted successfully',
                data: null,
            };
        } catch (error) {
            this.logger.error(`Failed to delete permission with ID ${id}`, error);
            throw error;
        }
    }
}
