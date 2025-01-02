import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    constructor(private readonly prisma: PrismaService) {}

    async getAllUsers() {
        this.logger.log('Fetching all users...');
        try {
            const users = await this.prisma.user.findMany({
                select: {
                    id: true,
                    email: true,
                    name: true,
                    displayName: true,
                    createdAt: true,
                    updatedAt: true,
                }, // Avoid returning sensitive data like passwords
            });
            this.logger.log('Fetched users successfully');
            return {
                message: 'Users fetched successfully',
                data: users,
            };
        } catch (error) {
            this.logger.error('Failed to fetch users', error.stack);
            throw error;
        }
    }

    async getUserById(id: string) {
        this.logger.log(`Fetching user with ID: ${id}`);
        try {
            const user = await this.prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    displayName: true,
                    createdAt: true,
                    updatedAt: true,
                }, // Avoid returning sensitive data like passwords
            });
            if (!user) {
                this.logger.warn(`User with ID ${id} not found`);
                throw new Error(`User with ID ${id} not found`);
            }
            this.logger.log(`Fetched user with ID ${id} successfully`);
            return {
                message: 'User fetched successfully',
                data: user,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch user with ID ${id}`, error.stack);
            throw error;
        }
    }

    async createUser(data: any) {
        this.logger.log(`Creating user: ${data.email}`);
        try {
            // Destructure roleId and permissions from the input
            const { roleId, permissions, ...userData } = data;

            // Create the user with the specified roleId
            const user = await this.prisma.user.create({
                data: {
                    ...userData,
                    roleId,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    displayName: true,
                    createdAt: true,
                    updatedAt: true,
                    role: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            // Assign permissions to the user, if provided
            if (permissions && permissions.length > 0) {
                await this.prisma.userPermission.createMany({
                    data: permissions.map((permissionId) => ({
                        userId: user.id,
                        permissionId,
                    })),
                });
                this.logger.log(`Permissions assigned to user: ${user.email}`);
            }

            this.logger.log(`User created successfully: ${user.email}`);
            return {
                message: 'User created successfully',
                data: user,
            };
        } catch (error) {
            this.logger.error(`Failed to create user: ${data.email}`, error.stack);
            throw error;
        }
    }



    async updateUser(
        id: string,
        data: { name?: string; displayName?: string; password?: string },
    ) {
        this.logger.log(`Updating user with ID: ${id}`);
        try {
            const user = await this.prisma.user.update({
                where: { id },
                data,
                select: {
                    id: true,
                    email: true,
                    name: true,
                    displayName: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            this.logger.log(`Updated user with ID ${id} successfully`);
            return {
                message: 'User updated successfully',
                data: user,
            };
        } catch (error) {
            this.logger.error(`Failed to update user with ID ${id}`, error.stack);
            throw error;
        }
    }

    async deleteUser(id: string) {
        this.logger.log(`Deleting user with ID: ${id}`);
        try {
            await this.prisma.user.delete({
                where: { id },
            });
            this.logger.log(`Deleted user with ID ${id} successfully`);
            return {
                message: `User with ID ${id} deleted successfully`,
                data: null,
            };
        } catch (error) {
            this.logger.error(`Failed to delete user with ID ${id}`, error.stack);
            throw error;
        }
    }
}
