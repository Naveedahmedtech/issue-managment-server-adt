import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body, Res,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Response } from 'express';

@Controller({ path: 'user', version: '1' })
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get()
    async getAllUsers() {
        return await this.userService.getAllUsers();
    }

    @Get(':id')
    async getUserById(@Param('id') id: string) {
        return await this.userService.getUserById(id);
    }

    @Post()
    async createUser(@Body() body: any) {
        return await this.userService.createUser(body);
    }

    @Post('signin')
    async login(@Body() body: any,
                @Res({ passthrough: true }) res: Response) {
        return await this.userService.signIn(body, res);
    }

    @Put(':id')
    async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
        return await this.userService.updateUser(id, body);
    }

    @Delete(':id')
    async deleteUser(@Param('id') id: string) {
        return await this.userService.deleteUser(id);
    }
}
