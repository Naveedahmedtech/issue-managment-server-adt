import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CompanyService } from "./company.service";




@Controller({ path: "company", version: "1" })
export class CompanyController {
    constructor(private readonly companyService: CompanyService) {}

    @Post()
    async createCompany(@Body() body: any) {
        return this.companyService.createCompany(body);
    }

    @Get()
    async getAllCompanies(@Query("page") page: string, @Query("limit") limit: string) { 
        
        const pageNumber = page ? parseInt(page) : 1;
        const limitNumber = limit ? parseInt(limit) : 10;
        return this.companyService.getAllCompanies(pageNumber, limitNumber);
    }

    @Get(":id")
    async getCompanyById(@Param("id") id: string) {
        return this.companyService.getCompanyById(id);
    }

    @Put(":id")
    async updateCompany(@Param("id") id: string, @Body() body: any) {
        return this.companyService.updateCompany(id, body);
    }

    @Delete(":id")
    async deleteCompany(@Param("id") id: string) {
        return this.companyService.deleteCompany(id);
    }
}
