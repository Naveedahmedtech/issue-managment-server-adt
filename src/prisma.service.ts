import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Database connection established successfully.');
        } catch (error) {
            this.logger.error('Failed to connect to the database.', error.stack);
            throw error; 
        }
    }

    async onModuleDestroy() {
        try {
            await this.$disconnect();
            this.logger.log('Database connection closed successfully.');
        } catch (error) {
            this.logger.error('Failed to disconnect from the database.', error.stack);
            throw error;
        }
    }
}
