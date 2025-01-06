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
} from '@nestjs/common';
import { Response } from 'express';
import { UserService } from './user.service';

@Controller({ path: 'user', version: '1' })
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get()
    async getAllUsers() {
        return await this.userService.getAllUsers();
    }

    @Get('azure/login')
    async loginWithAzuer() {
        return await this.userService.azureLogin();
    }

    @Get('azure/redirect')
    async handleAzureRedirect(@Query('code') code: string, @Res({ passthrough: true }) res: Response) {
        return await this.userService.azureRedirect(code, res);
        // return "HELLO WORLD";
    }

    @Get(':id')
    async getUserById(@Param('id') id: string) {
        return await this.userService.getUserById(id);
    }

    @Post('azure')
    async createUser(@Body() body: any) {
        return await this.userService.createUser(body);
    }

    @Put('azure/:id')
    async updateUser(@Param('id') id: string, @Body() body: any) {
        return await this.userService.updateUser(id, body);
    }

    @Delete('azure/:id')
    async deleteUser(@Param('id') id: string) {
        return await this.userService.deleteUser(id);
    }
}
