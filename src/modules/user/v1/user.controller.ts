import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Res,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { UserService } from "./user.service";
import { AuthGuard } from "src/guards/auth.guard";

@Controller({ path: "user", version: "1" })
export class UserController {
  constructor(private readonly userService: UserService) {}


  @UseGuards(AuthGuard)
  @Get()
  async getAllUsers(
    @Query("page") page: string,
    @Query("limit") limit: string,
    @Req() req: Request
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    return await this.userService.getAllUsers(pageNumber, limitNumber, req);
  }

  @Get("azure/login")
  async loginWithAzuer() {
    return await this.userService.azureLogin();
  }

  @Get("azure/redirect")
  async handleAzureRedirect(
    @Query("code") code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return await this.userService.azureRedirect(code, res);
    // return "HELLO WORLD";
  }

  @Get(":id")
  async getUserById(@Param("id") id: string) {
    return await this.userService.getUserById(id);
  }

  @Post("azure")
  async createUser(@Body() body: any) {
    return await this.userService.createUser(body);
  }

  @Put("azure/:id")
  async updateUser(@Param("id") id: string, @Body() body: any) {
    return await this.userService.updateUser(id, body);
  }

  @Delete("azure/:id")
  async deleteUser(@Param("id") id: string) {
    return await this.userService.deleteUser(id);
  }

  @UseGuards(AuthGuard)
  @Get("by/token")
  async getToken(@Req() req: Request) {
    return this.userService.getUserByToken(req);
  }

  @UseGuards(AuthGuard)
  @Post("logout")
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.userService.logout(res);
  }
}
