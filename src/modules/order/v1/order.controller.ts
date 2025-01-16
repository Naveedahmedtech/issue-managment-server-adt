import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UploadedFiles,
  Param,
  Put,
  Query,
  Get,
  Delete,
  Patch,
} from "@nestjs/common";
import { OrderService } from "./order.service";
import { Request } from "express";
import { AuthGuard } from "src/guards/auth.guard";
import { FileUploadInterceptor } from "src/interceptor/file-upload.interceptor";
import { RolesAndPermissions } from "src/utils/roleAndPermission.decorator";
import { ROLES } from "src/constants/roles-permissions.constants";
import { User } from "@prisma/client";

@Controller({ path: "order", version: "1" })
@UseGuards(AuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @FileUploadInterceptor("./uploads/orders", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async createOrder(
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.orderService.createOrder(req, files);
  }

  @Put(":id")
  @FileUploadInterceptor("./uploads/orders", 10)
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async updateProject(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() data: any,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.orderService.updateOrder(id, req, files);
  }

  @Post(":oderId/files")
  @FileUploadInterceptor("./uploads/orders", 10) // Upload up to 10 files to the 'orders' directory
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async uploadFilesToProject(
    @Req() req: Request,
    @Param("oderId") oderId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return await this.orderService.uploadFilesToOrder(oderId, files);
  }

  @Patch(":orderId/toggle-archive")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async toggleArchiveProject(
    @Param("orderId") orderId: string,
  ) {
    return await this.orderService.toggleArchiveOrder(orderId);
  }

  @Get()
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjects(
    // @Query("page") page: string,
    // @Query("limit") limit: string,
  ) {
    // const pageNumber = parseInt(page, 10) || 1;
    // const limitNumber = parseInt(limit, 10) || 10;

    // return this.orderService.getProjects(pageNumber, limitNumber);
  }

  @Get("list")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getAllProjectList(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.orderService.getOrderList(pageNumber, limitNumber);
  }

  @Get(":oderId")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getById(@Param("oderId") oderId: string) {
    return this.orderService.getById(oderId);
  }

  @Get("archived/list")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getArchivedOrderList(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    return this.orderService.getArchivedOrderList(pageNumber, limitNumber);
  }

  @Delete(":oderId")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN])
  async deleteProject(
    @Param("oderId") oderId: string,
    @Req() req: Request & { userDetails?: User },
  ) {
    return await this.orderService.deleteOrder(oderId, req);
  }

  @Get("dashboard/stats")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getProjectStats() {
    return await this.orderService.getOrderStats();
  }

  @Get("dashboard/recent")
  @RolesAndPermissions([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.WORKER])
  async getRecentProjects(
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return await this.orderService.getRecentOrders(pageNumber, limitNumber);
  }

}
