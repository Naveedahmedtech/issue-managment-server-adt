import {Reflector} from '@nestjs/core';
import {CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {PrismaService} from "../utils/prisma.service";
import {Request} from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
        private readonly reflector: Reflector
    ) {
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        try {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZDllNGNjOC1lMzlmLTQ1ZDYtODE3Yy1hZTdlZmVlMTViZGUiLCJlbWFpbCI6InN1cGVyX2FkbWluQHZpZXdzb2Z0d2ViLm9ubWljcm9zb2Z0LmNvbSIsIm5hbWUiOiJTdXBlciBBZG1pbiIsImlhdCI6MTc0ODU4NDcyMSwiZXhwIjoxNzQ5MTg5NTIxfQ.C3lAc1Zv7_AIDZrU2ziAMWsQI9q1IVrmxEw65OU_yH8'
            // const token = this.extractTokenFromCookie(request);
            // if (!token) {
            //     throw new UnauthorizedException('No token found');
            // }

            const payload = this.jwtService.verify(token);
            request['user'] = payload; // Attach the user info to the request object

            const user = await this.prisma.user.findUnique({
                where: {azureId: payload.sub},
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {permission: true},
                            },
                        },
                    },
                    userPermissions: {
                        include: {permission: true},
                    },
                },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            request['userDetails'] = user;

            // SUPER_ADMIN bypass
            if (user.role.name === 'SUPER_ADMIN') {
                return true; // Bypass all role and permission checks
            }

            // Validate roles and permissions
            const requiredAccess = this.reflector.get<{ roles: string[]; permissions: string[] }>(
                'rolesAndPermissions',
                context.getHandler()
            );

            if (requiredAccess) {
                const {roles, permissions} = requiredAccess;
                await this.validateAccess(request, roles, permissions);
            }

            return true;
        } catch (error) {
            console.error('ERROR✅✅✅✅', error);
            throw error;
        }
    }

    async validateAccess(
        request: Request,
        requiredRoles: string[] = [],
        requiredPermissions: string[] = []
    ): Promise<boolean> {
        const user = request['userDetails'];

        if (requiredRoles.length > 0) {
            const hasRole = requiredRoles.includes(user.role.name);
            if (!hasRole) {
                throw new ForbiddenException('Insufficient role privileges');
            }
        }

        if (requiredPermissions.length > 0) {
            const userPermissions = [
                ...user.role.permissions.map((rp) => rp.permission.action),
                ...user.userPermissions.map((up) => up.permission.action),
            ];
            const hasPermission = requiredPermissions.every((permission) =>
                userPermissions.includes(permission)
            );

            if (!hasPermission) {
                throw new ForbiddenException('Insufficient permission privileges');
            }
        }

        return true;
    }

    private extractTokenFromCookie(request: Request): string | null {
        const authHeader = request.headers['authorization'] || request.headers['Authorization'];
        let accessToken;
        if (typeof authHeader === 'string') {
            const [scheme, token] = authHeader.split(' ');
            if (scheme === 'Bearer' && token) {
                accessToken = token;
            }
        }
        return request.cookies?.auth_token || accessToken;
    }
}

