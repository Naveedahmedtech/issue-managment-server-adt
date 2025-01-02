import { SetMetadata } from '@nestjs/common';

export const RolesAndPermissions = (roles: string[] = [], permissions: string[] = []): MethodDecorator =>
    SetMetadata('rolesAndPermissions', { roles, permissions });
