import { Injectable, Logger, NotFoundException, InternalServerErrorException } from "@nestjs/common";
import { Company } from "@prisma/client";
import { PrismaService } from "src/utils/prisma.service";

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ✅ Create a new company with logging & error handling
  async createCompany(body: {name: string}): Promise<Company> {
    const { name } = body;
    this.logger.log(`Creating a new company: ${name}`);

    try {
      const company = await this.prisma.company.create({ data: { name } });
      this.logger.log(`Company created successfully: ${company.id}`);
      return company;
    } catch (error) {
      this.logger.error("Error creating company", { name, error });
      throw new InternalServerErrorException("Failed to create company");
    }
  }

  // ✅ Get all companies with logging, pagination & error handling
  async getAllCompanies(page: number = 1, limit: number = 10) {
    this.logger.log(`Fetching companies - Page: ${page}, Limit: ${limit}`);

    try {
      const totalCompanies = await this.prisma.company.count();
      const totalPages = Math.ceil(totalCompanies / limit);

      const companies = await this.prisma.company.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      });

      this.logger.log(`Retrieved ${companies.length} companies`);
      return {
        message: "Companies retrieved successfully!",
        data: { total: totalCompanies, page, limit, totalPages, companies },
      };
    } catch (error) {
      this.logger.error("Error fetching companies", error );
      throw new InternalServerErrorException("Failed to fetch companies");
    }
  }

  // ✅ Get a single company by ID with logging & error handling
  async getCompanyById(id: string): Promise<Company> {
    this.logger.log(`Fetching company with ID: ${id}`);

    try {
      const company = await this.prisma.company.findUnique({ where: { id } });

      if (!company) {
        this.logger.warn(`Company with ID ${id} not found`);
        throw new NotFoundException(`Company with ID ${id} not found.`);
      }

      this.logger.log(`Company retrieved successfully: ${company.id}`);
      return company;
    } catch (error) {
      this.logger.error("Error fetching company by ID", { id, error });
      throw new InternalServerErrorException("Failed to fetch company");
    }
  }

  // ✅ Update a company's name with logging & error handling
  async updateCompany(id: string, body: {name: string}): Promise<Company> {
    const { name } = body;
    this.logger.log(`Updating company ID: ${id} with new name: ${name}`);

    try {
      const updatedCompany = await this.prisma.company.update({
        where: { id },
        data: { name },
      });

      this.logger.log(`Company updated successfully: ${updatedCompany.id}`);
      return updatedCompany;
    } catch (error) {
      this.logger.error("Error updating company", error);
      throw new InternalServerErrorException("Failed to update company");
    }
  }

  // ✅ Delete a company with logging & error handling
  async deleteCompany(id: string): Promise<{ message: string }> {
    this.logger.log(`Deleting company with ID: ${id}`);

    try {
      await this.prisma.company.delete({ where: { id } });
      this.logger.log(`Company with ID ${id} deleted successfully`);
      return { message: "Company deleted successfully!" };
    } catch (error) {
      this.logger.error("Error deleting company", { id, error });
      throw new InternalServerErrorException("Failed to delete company");
    }
  }
}
