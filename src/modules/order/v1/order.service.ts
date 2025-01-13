import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { join } from "path";
import { unlink } from "fs/promises";
import { PrismaService } from "src/utils/prisma.service";
import { posix as pathPosix } from "path";
import { normalizeKeys } from "src/utils/common";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createOrder(
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
  ) {
    try {
      const { id: userId } = req.userDetails;

      const newOrder = await this.prisma.order.create({
        data: {
          name: req.body.name,
          price: parseFloat(req.body.price),
          description: req.body.description,
          location: req.body.location,
          status: req.body.status,
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate),
          userId,
        },
      });

      if (files && files.length > 0) {
        for (const file of files) {
          await this.prisma.orderFile.create({
            data: {
              orderId: newOrder.id,
              filePath: pathPosix.join("uploads", "orders", file.filename),
            },
          });
        }
      }

      this.logger.log(`order created successfully: ${newOrder.id}`);
      return { message: "order created successfully", data: newOrder };
    } catch (error) {
      this.logger.error("Failed to create order", error.stack);

      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/orders", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }

      throw error;
    }
  }

  async updateOrder(
    orderId: string,
    req: Request & { userDetails?: User },
    files: Array<Express.Multer.File>,
  ) {
    try {
      const normalizedBody = normalizeKeys(req.body) as any;
  
      // Build update data
      const updateData: any = {
        ...(normalizedBody.name && { name: normalizedBody.name }),
        ...(normalizedBody.price && { price: parseFloat(normalizedBody.price) }),
        ...(normalizedBody.location && { location: normalizedBody.location }),
        ...(normalizedBody.description && { description: normalizedBody.description }),
        ...(normalizedBody.status && { status: normalizedBody.status }),
        ...(normalizedBody.startDate && { startDate: new Date(normalizedBody.startDate) }),
        ...(normalizedBody.endDate && { endDate: new Date(normalizedBody.endDate) }),
      };
  
      // Update order details
      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: updateData,
      });
  
      // Get existing files for this order
      const existingFiles = await this.prisma.orderFile.findMany({
        where: { orderId },
        select: {
          id: true,
          filePath: true,
        },
      });
  
      // Extract filenames of already uploaded files
      const existingFileNames = existingFiles.map(file => pathPosix.basename(file.filePath));
  
      // Add new files if they are not duplicates
      const newFiles = files.filter(file => !existingFileNames.includes(file.filename));
  
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.orderFile.create({
            data: {
              orderId: updatedOrder.id,
              filePath: pathPosix.join("uploads", "orders", file.filename),
            },
          });
        }
      }
  
      // Return updated project with files
      const allFiles = await this.prisma.orderFile.findMany({
        where: { orderId },
        select: {
          id: true,
          filePath: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  
      this.logger.log(`order updated successfully: ${updatedOrder.id}`);
      return {
        message: "order updated successfully!",
        data: {
          ...updatedOrder,
          files: allFiles,
        },
      };
    } catch (error) {
      // Error handling with cleanup for newly uploaded files
      this.logger.error("Failed to update order", error.stack);
  
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join("./uploads/orders", file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }
  
      throw error;
    }
  }
  



  async uploadFilesToOrder(
    orderId: string,
    files: Array<Express.Multer.File>,
  ) {
    try {
      // Validate if the project exists
      const project = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
  
      if (!project) {
        throw new NotFoundException('Order not found!');
      }
  
      // Fetch existing file paths for this project
      const existingFiles = await this.prisma.orderFile.findMany({
        where: { orderId },
        select: { filePath: true },
      });
  
      // Extract existing filenames
      const existingFileNames = existingFiles.map(file =>
        pathPosix.basename(file.filePath),
      );
  
      // Filter out already uploaded files
      const newFiles = files.filter(file => !existingFileNames.includes(file.filename));
  
      // Insert only new files into the File table
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          await this.prisma.orderFile.create({
            data: {
              orderId,
              filePath: pathPosix.join('uploads', 'orders', file.filename),
            },
          });
        }
      }
  
      this.logger.log(
        `Files uploaded to order: ${orderId}, Skipped files: ${files.length - newFiles.length}`,
      );
  
      return {
        message: 'Files uploaded successfully!',
        orderId,
        skippedFiles: files.length - newFiles.length,
        uploadedFiles: newFiles.length,
      };
    } catch (error) {
      this.logger.error(`Failed to upload files to order: ${orderId}`, error.stack);
  
      // Cleanup uploaded files on error
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            await unlink(join('./uploads/orders', file.filename));
            this.logger.log(`Deleted file: ${file.filename}`);
          } catch (err) {
            this.logger.error(`Failed to delete file: ${file.filename}`, err);
          }
        }
      }
  
      throw error;
    }
  }
  
  
  

  async getOrders(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      const orders = await this.prisma.project.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          files: true,
        },
      });

      const totalOrders = await this.prisma.project.count();
      const response = {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit),
        orders
      }
      return {
        message: "orders retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch orders", error.stack);
      throw error;
    }
  }


  async getOrderList(page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      
      // Fetch orders with only id and name
      const orders = await this.prisma.order.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
        },
      });
  
      const totalOrders = await this.prisma.order.count();
      const response = {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit),
        orders,
      };
      return {
        message: "orders retrieved successfully!",
        data: response,
      };
    } catch (error) {
      this.logger.error("Failed to fetch orders", error.stack);
      throw error;
    }
  }
  


  async getById(orderId: string) {
    try {
      // Fetch project by ID along with its files
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          files: {
            select: {
              id: true,
              filePath: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });
  
      if (!order) {
        throw new NotFoundException("Order not found");
      }
  
      return {
        message: "Order retrieved successfully!",
        data: order,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch order with id ${orderId}`, error.stack);
      throw error;
    }
  }


  async deleteOrder(orderId: string, req: Request & { userDetails?: User }) {
    try {
      // Verify if the user owns the project
      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          userId: req.userDetails?.id,
        },
      });
  
      if (!order) {
        this.logger.warn(`Order not found or access denied: ${orderId}`);
        throw new UnauthorizedException("Order not found or access denied");
      }
  
      // Find all associated files
      const files = await this.prisma.orderFile.findMany({
        where: {
          orderId: orderId,
        },
      });
  
      // Delete project files from the file system
      for (const file of files) {
        try {
          await unlink(join("./uploads/orders", file.filePath));
          this.logger.log(`Deleted file from disk: ${file.filePath}`);
        } catch (err) {
          this.logger.error(`Failed to delete file from disk: ${file.filePath}`, err);
        }
      }
  
      // Delete files from the database
      await this.prisma.orderFile.deleteMany({
        where: {
          orderId: orderId,
        },
      });
  
      // Delete the order
      await this.prisma.order.delete({
        where: {
          id: orderId,
        },
      });
  
      this.logger.log(`Order deleted successfully: ${orderId}`);
      return { message: "Order deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete order: ${orderId}`, error.stack);
      throw error;
    }
  }
  

  async getOrderStats() {
    try {
      // Fetch total project count
      const totalOrders = await this.prisma.order.count();
  
  
      // Fetch total completed issues count
      const totalCompletedOrders = await this.prisma.order.count({
        where: {
          status: 'Completed',
        },
      });
  
      // Fetch total to-do issues count
      const totalPendingOrders = await this.prisma.order.count({
        where: {
          status: 'Pending',
        },
      });

      // Fetch total to-do issues count
      const totalInProgressOrders = await this.prisma.order.count({
        where: {
          status: 'In Progress',
        },
      });
  
      return {
        message: 'Project statistics retrieved successfully!',
        data: {
          totalOrders,
          totalInProgressOrders,
          totalPendingOrders,
          totalCompletedOrders,
        },
      };
    } catch (error) {
      this.logger.error('Failed to retrieve project statistics', error.stack);
      throw error;
    }
  }
  

  async getRecentOrders(page: number = 1, limit: number = 10) {
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
  
      // Fetch recent orders, ordered by creation date (most recent first)
      const recentOrders = await this.prisma.order.findMany({
        skip: offset,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          location: true,
          price: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  
      // Fetch the total project count for pagination
      const totalOrders = await this.prisma.project.count();
  
      // Return the response
      return {
        message: 'Recent orders retrieved successfully!',
        data: {
          page,
          limit,
          totalOrders,
          totalPages: Math.ceil(totalOrders / limit),
          orders: recentOrders,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch recent orders', error.stack);
      throw error;
    }
  }
  

}
