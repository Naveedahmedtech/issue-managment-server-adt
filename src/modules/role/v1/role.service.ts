import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../utils/prisma.service';

@Injectable()
export class RoleService {
    private readonly logger = new Logger(RoleService.name);

    constructor(private readonly prisma: PrismaService) {}

    async getAllRoles() {
        this.logger.log('Fetching all roles...');
        try {
            const roles = await this.prisma.role.findMany();
            this.logger.log('Fetched roles successfully');
            return {
                message: 'Roles fetched successfully',
                data: roles,
            };
        } catch (error) {
            this.logger.error('Failed to fetch roles', error);
            throw error;
        }
    }

    async createRole(data: { name: string; description?: string }) {
        this.logger.log(`Creating role: ${data.name}`);
        data.name = data.name.toUpperCase();
        try {
            const role = await this.prisma.role.create({ data });
            this.logger.log(`Role created successfully: ${role.name}`);
            return {
                message: 'Role created successfully',
                data: role,
            };
        } catch (error) {
            this.logger.error(`Failed to create role: ${data.name}`, error);
            throw error;
        }
    }

    async updateRole(id: string, data: { name?: string; description?: string }) {
        this.logger.log(`Updating role with ID: ${id}`);
        try {
            const role = await this.prisma.role.update({
                where: { id },
                data,
            });
            this.logger.log(`Updated role successfully: ID ${id}`);
            return {
                message: 'Role updated successfully',
                data: role,
            };
        } catch (error) {
            this.logger.error(`Failed to update role: ID ${id}`, error);
            throw error;
        }
    }

    async deleteRole(id: string) {
        this.logger.log(`Deleting role with ID: ${id}`);
        try {
            await this.prisma.role.delete({ where: { id } });
            this.logger.log(`Deleted role successfully: ID ${id}`);
            return {
                message: `Role with ID ${id} deleted successfully`,
                data: null,
            };
        } catch (error) {
            this.logger.error(`Failed to delete role: ID ${id}`, error);
            throw error;
        }
    }
}
