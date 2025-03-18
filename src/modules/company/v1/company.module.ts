import { Module } from "@nestjs/common";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { PrismaService } from "src/utils/prisma.service";

@Module({
    controllers: [CompanyController],
    providers: [CompanyService, PrismaService],
})
export class CompanyModule {}
