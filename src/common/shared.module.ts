import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
    imports: [
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'default_secret',
            signOptions: { expiresIn: '7d',
            },
        }),
    ],
    exports: [JwtModule], // Export JwtModule globally
})
export class SharedModule {}
