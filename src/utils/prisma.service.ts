import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
  } from "@nestjs/common";
  import { PrismaClient } from "@prisma/client";
  
  @Injectable()
  export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
  {
    private readonly logger = new Logger(PrismaService.name);
  
    constructor() {
      super();
  
      this.$use(async (params, next) => {
        if (params.model === "Issue" && params.action === "create") {
          const result = await next(params);
  
          await this.issueHistory.create({
            data: {
              issueId: result.id,
              userId: result.userId,
              fieldName: "Issue Created",
              oldValue: null,
              newValue: `Title: ${result.title} \n Description: ${result.description} \n Start Date: ${result.startDate} \n end Date: ${result.endDate} \n Status: ${result.status}`,
            },
          });
  
          this.logger.log("Issue history created!");
          return result;
        }
  
        return next(params);
      });
    }
  
    async onModuleInit() {
      try {
        await this.$connect();
        this.logger.log("Database connection established successfully.");
      } catch (error) {
        this.logger.error("Failed to connect to the database.", error);
        throw error;
      }
    }
  
    async onModuleDestroy() {
      try {
        await this.$disconnect();
        this.logger.log("Database connection closed successfully.");
      } catch (error) {
        this.logger.error("Failed to disconnect from the database.", error);
        throw error;
      }
    }
  }
  