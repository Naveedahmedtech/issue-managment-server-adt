import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
    imports: [
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'jwt-secret',
            signOptions: { expiresIn: process.env.JWT_EXPIRY || '7d',
            },
        }),
    ],
    exports: [JwtModule], // Export JwtModule globally
})
export class SharedModule {}
