import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../../utils/prisma.service";
import { Request, Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { randomBytes } from "crypto";
import axios from "axios";
import * as bcrypt from "bcrypt";
import { User } from "@prisma/client";
import { ROLES } from "src/constants/roles-permissions.constants";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly msalClient: ConfidentialClientApplication;
  private cachedToken: string | null = null;
  private tokenExpiryTime: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_SECRET,
      },
    });
  }

  /**
   * Get an access token from Azure AD.
   * caching and refreshing tokens when expired.
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a cached token and it's still valid
    // if (this.cachedToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime) {
    //     this.logger.log('Using cached Azure AD token');
    //     return this.cachedToken;
    // }

    this.logger.log("Fetching new Azure AD token");
    try {
      // Send the request to get a new token
      const response = await axios.post(
        `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: process.env.AZURE_CLIENT,
          client_secret: process.env.AZURE_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      );

      // Destructure the response to get the token and expiry time
      const { access_token, expires_in } = response.data;
      // Cache the token and calculate the expiry time
      this.cachedToken = access_token;
      this.tokenExpiryTime = Date.now() + expires_in * 1000; // Convert to milliseconds

      this.logger.log("Successfully fetched new Azure AD token");
      return access_token;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        this.logger.error(
          `Failed to fetch Azure AD token. Status: ${status}, Message: ${data.error_description || data.error}`,
        );
        throw new UnauthorizedException(
          `Azure AD token request failed: ${data.error_description || data.error}`,
        );
      } else {
        this.logger.error(
          "Unexpected error while fetching Azure AD token",
          error,
        );
        throw new UnauthorizedException(
          "Could not retrieve access token from Azure AD",
        );
      }
    }
  }

  /**
   * create a user in Azure AD.
   * Access token
   */
  private async createAzureUser(data: any): Promise<any> {
    const token = await this.getAccessToken();

    try {
      this.logger.log(`Creating Azure AD user: ${data.userPrincipalName}`);
      const response = await axios.post(
        "https://graph.microsoft.com/v1.0/users",
        {
          accountEnabled: true,
          displayName: data.displayName,
          mailNickname: data.mailNickname,
          userPrincipalName: data.userPrincipalName,
          passwordProfile: {
            forceChangePasswordNextSignIn: true,
            password: data.password,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logger.log(
        `Azure AD user created successfully: ${data.userPrincipalName}`,
      );
      return response.data;
    } catch (error) {
      console.log("error", error);

      this.logger.error(
        "Failed to create Azure AD user",
        error.response?.data || error,
      );
      throw new Error("Error creating user in Azure AD");
    }
  }

  /**
   * Invite an external user to Azure AD.
   */
  private async inviteExternalUser(data: any): Promise<any> {
    const token = await this.getAccessToken();

    try {
      this.logger.log(`Inviting external user: ${data.emailAddress}`);

      const response = await axios.post(
        "https://graph.microsoft.com/v1.0/invitations",
        {
          invitedUserEmailAddress: data.emailAddress,
          inviteRedirectUrl:
            "https://myapplications.microsoft.com/?tenantid=177709d9-e0ab-4f40-a7d6-a9e917bff688",
          sendInvitationMessage: true, // Set to true to send an email invitation
          invitedUserDisplayName: data.displayName || data.emailAddress,
          invitedUserType: "Guest", // Ensure it's a guest user
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      this.logger.log(
        `External user invited successfully: ${data.emailAddress}`,
      );
      return response.data;
    } catch (error) {
      console.error("Error inviting external user:", error);
      this.logger.error(
        "Failed to invite external Azure AD user",
        error.response?.data || error,
      );
      throw new Error("Error inviting external user in Azure AD");
    }
  }

  /**
   * Delete user from Azure AD.
   */
  private async deleteAzureUser(azureId: string): Promise<void> {
    this.logger.log(`Deleting Azure AD user with ID: ${azureId}`);
    try {
      const token = await this.getAccessToken();

      await axios.delete(`https://graph.microsoft.com/v1.0/users/${azureId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.logger.log(`Azure AD user with ID ${azureId} deleted successfully.`);
    } catch (error) {
      this.logger.error(
        `Failed to delete Azure AD user with ID: ${azureId}`,
        error.response?.data || error,
      );
      throw new Error("Error deleting user from Azure AD.");
    }
  }

  private async updateAzureUser(azureUserId: string, data: any): Promise<void> {
    const token = await this.getAccessToken();

    try {
      this.logger.log(`Updating Azure AD user: ${azureUserId}`);
      await axios.patch(
        `https://graph.microsoft.com/v1.0/users/${azureUserId}`,
        {
          displayName: data.displayName,
          mailNickname: data.email.split("@")[0],
          userPrincipalName: data.email,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      this.logger.log(`Azure AD user updated successfully: ${azureUserId}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        this.logger.error(`Azure AD Error: ${status} - ${data.error?.message}`);
        throw new Error(
          data.error?.message || "Failed to update user in Azure AD",
        );
      } else {
        this.logger.error(
          "Unexpected error while updating Azure AD user",
          error,
        );
        throw new Error(
          "Unexpected error occurred while updating Azure AD user.",
        );
      }
    }
  }

  /**
   * Create a user both in Azure AD and locally in the database.
   */
  async createUser(data: any) {
    this.logger.log(`Creating user: ${data.email}`);
    const hashedPassword = await bcrypt.hash(data.password, 10);
    try {
      // First, create the user in Azure AD
      const azureUser = await this.inviteExternalUser({
        displayName: data.displayName,
        emailAddress: data.email,
        userPrincipalName: data.email,
        password: data.password,
        accountEnabled: data.accountEnabled,
      });
      // const azureUser = await this.createAzureUser({
      //   displayName: data.displayName,
      //   mailNickname: data.email.split("@")[0],
      //   userPrincipalName: data.email,
      //   password: data.password,
      //   accountEnabled: data.accountEnabled,
      // });

      // Destructure roleId and permissions from the input
      const { roleId, permissions, ...userData } = data;

      // Create the user locally in the database
      const user = await this.prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
          roleId,
          azureId: azureUser.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Assign permissions to the user, if provided
      if (permissions && permissions.length > 0) {
        await this.prisma.userPermission.createMany({
          data: permissions.map((permissionId) => ({
            userId: user.id,
            permissionId,
          })),
        });
        this.logger.log(`Permissions assigned to user: ${user.email}`);
      }

      this.logger.log(`User created successfully: ${user.email}`);
      return {
        message: "User created successfully",
        data: user,
      };
    } catch (error) {
      this.logger.error(`Failed to create user: ${data.email}`, error);
      throw error;
    }
  }

  async updateUser(userId: string, data: any) {
    this.logger.log(`Updating user: ${userId}`);
    try {
      // Check if the user exists
      const existingUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: true,
          userPermissions: true,
        },
      });

      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Start building the update object
      const updateData: any = {};

      // Update basic user details if provided
      if (data.name) updateData.name = data.name;
      // if (data.email) updateData.email = data.email;
      if (data.displayName) updateData.displayName = data.displayName;
      // if (data.email && data.email !== existingUser.email) {
      //   updateData.email = data.email;
      //   await this.updateAzureUser(existingUser.azureId, { email: data.email });
      // }

      // Handle role updates
      if (data.roleId && data.roleId !== existingUser.roleId) {
        const roleExists = await this.prisma.role.findUnique({
          where: { id: data.roleId },
        });

        if (!roleExists) {
          throw new Error(`Role with ID ${data.roleId} not found`);
        }

        updateData.roleId = data.roleId;
      }

      // Start a Prisma transaction
      const transactions: any[] = [];

      // Update user details if any fields are provided
      if (Object.keys(updateData).length > 0) {
        transactions.push(
          this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
              id: true,
              email: true,
              name: true,
              displayName: true,
              createdAt: true,
              updatedAt: true,
              role: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }),
        );
      }

      // Handle permission updates
      if (data.permissions && Array.isArray(data.permissions)) {
        // Clear existing permissions
        transactions.push(
          this.prisma.userPermission.deleteMany({
            where: { userId },
          }),
        );

        // Add new permissions
        transactions.push(
          this.prisma.userPermission.createMany({
            data: data.permissions.map((permissionId: string) => ({
              userId,
              permissionId,
            })),
            skipDuplicates: true,
          }),
        );
      }

      // Execute the transactions
      const [updatedUser] = await this.prisma.$transaction(transactions);

      this.logger.log(
        `User updated successfully: ${updatedUser?.email || userId}`,
      );
      return {
        message: "User updated successfully",
        data: updatedUser || { userId },
      };
    } catch (error) {
      this.logger.error(
        `Failed to update user: ${data?.email || userId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * delete a user from the database and Azure AD.
   */
  async deleteUser(userId: string): Promise<any> {
    this.logger.log(`Deleting user with ID: ${userId}`);
    try {
      // Fetch the user from the database
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found.`);
      }

      // Delete the user from Azure AD
      // await this.deleteAzureUser(user.azureId);

      // Soft delete the user by updating the `deleted_at` and `is_deleted` fields
      await this.prisma.user.delete({
        where: { id: userId },
      });

      this.logger.log(`User with ID ${userId} soft-deleted successfully.`);
      return {
        message: "User deleted successfully.",
      };
    } catch (error) {
      this.logger.error(`Failed to delete user with ID: ${userId}`, error);
      throw error;
    }
  }

  // async getAllUsers(page: number = 1, limit: number = 20, roleName?: string) {
  //   try {
  //     const skip = (page - 1) * limit;

  //     // Build the where clause conditionally based on roleName
  //     const whereClause = roleName
  //       ? {
  //           role: {
  //             name: roleName,
  //           },
  //         }
  //       : {};

  //     // Fetch users, optionally filtering by role name
  //     const users = await this.prisma.user.findMany({
  //       skip,
  //       take: limit,
  //       where: whereClause,
  //       select: {
  //         id: true,
  //         email: true,
  //         name: true,
  //         displayName: true,
  //         createdAt: true,
  //         updatedAt: true,
  //         role: {
  //           select: {
  //             id: true,
  //             name: true,
  //             permissions: {
  //               select: {
  //                 permission: {
  //                   select: {
  //                     action: true,
  //                     description: true,
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //         userPermissions: {
  //           select: {
  //             permission: {
  //               select: {
  //                 action: true,
  //                 description: true,
  //               },
  //             },
  //           },
  //         },
  //       },
  //     });

  //     // Count total users, applying the same role name filter if provided
  //     const totalUsers = await this.prisma.user.count({
  //       where: whereClause,
  //     });

  //     // Format the users' data
  //     const formattedUsers = users.map((user) => {
  //       const rolePermissions =
  //         user.role?.permissions.map((p) => p.permission.action) || [];
  //       const userPermissions =
  //         user.userPermissions.map((p) => p.permission.action) || [];

  //       return {
  //         id: user.id,
  //         email: user.email,
  //         name: user.name,
  //         displayName: user.displayName,
  //         role: user.role?.name,
  //         permissions: Array.from(
  //           new Set([...rolePermissions, ...userPermissions]),
  //         ),
  //         createdAt: user.createdAt,
  //         updatedAt: user.updatedAt,
  //       };
  //     });

  //     this.logger.log("Fetched users successfully");
  //     return {
  //       message: "Users fetched successfully",
  //       data: {
  //         pagination: {
  //           total: totalUsers,
  //           page,
  //           limit,
  //         },
  //         users: formattedUsers,
  //       },
  //     };
  //   } catch (error) {
  //     this.logger.error("Failed to fetch users", error);
  //     throw error;
  //   }
  // }

  async getAllUsers(page: number = 1, limit: number = 20, roleName?: string) {
    try {
      const skip = (page - 1) * limit;

      // Build the where clause conditionally based on roleName and excluding specific emails
      const whereClause: any = {
        // NOT: [
        //   { email: "jonas@viewsoft.com" },
        //   { email: "malik.wahhab@aridiantechnologies.co" },
        //   { email: "super_admin@viewsoftweb.onmicrosoft.com" },
        // ],
      };

      if (roleName) {
        whereClause.role = {
          name: roleName,
        };
      }

      // Fetch users, optionally filtering by role name
      const users = await this.prisma.user.findMany({
        skip,
        take: limit,
        where: whereClause,
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: {
                      action: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
          userPermissions: {
            select: {
              permission: {
                select: {
                  action: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      // Count total users, applying the same role name filter and exclusion rule
      const totalUsers = await this.prisma.user.count({
        where: whereClause,
      });

      // Format the users' data
      const formattedUsers = users.map((user) => {
        const rolePermissions =
          user.role?.permissions.map((p) => p.permission.action) || [];
        const userPermissions =
          user.userPermissions.map((p) => p.permission.action) || [];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          displayName: user.displayName,
          role: user.role?.name,
          permissions: Array.from(
            new Set([...rolePermissions, ...userPermissions]),
          ),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      });

      this.logger.log("Fetched users successfully");
      return {
        message: "Users fetched successfully",
        data: {
          pagination: {
            total: totalUsers,
            page,
            limit,
          },
          users: formattedUsers,
        },
      };
    } catch (error) {
      this.logger.error("Failed to fetch users", error);
      throw error;
    }
  }

  async getUserById(id: string) {
    this.logger.log(`Fetching user with ID: ${id}`);
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
        }, // Avoid returning sensitive data like passwords
      });
      if (!user) {
        this.logger.warn(`User with ID ${id} not found`);
        throw new Error(`User with ID ${id} not found`);
      }
      this.logger.log(`Fetched user with ID ${id} successfully`);
      return {
        message: "User fetched successfully",
        data: user,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch user with ID ${id}`, error);
      throw error;
    }
  }

  async azureRedirect(code: string, res: Response) {
    try {
      const redirectUri = `${process.env.SERVER_URL}${process.env.AZURE_REDIRECT_URI}`;
      const result = await this.msalClient.acquireTokenByCode({
        code,
        redirectUri,
        scopes: ["openid", "profile", "email"],
      });

      if (!result || !result.accessToken) {
        throw new UnauthorizedException("Invalid or expired Azure token");
      }

      const userData = {
        azureId: result.uniqueId,
        email: result.account?.username,
        name: result.account?.name,
      };

      // Check if the user exists in the database
      let user = await this.prisma.user.findUnique({
        where: { email: userData.email },
      });

      let role;
      if (!user) {
        // Assign role based on predefined admin emails
        if (
          userData.email === "johannes@assemble-it.no" ||
          userData.email === "malik.wahhab@aridiantechnologies.co" ||
          userData.email === "super_admin@viewsoftweb.onmicrosoft.com"
        ) {
          role = await this.prisma.role.findUnique({
            where: { name: ROLES.SUPER_ADMIN },
          });
        } else {
          role = await this.prisma.role.findUnique({
            where: { name: ROLES.WORKER },
          });
        }

        // Create the new user with the assigned role
        user = await this.prisma.user.create({
          data: {
            azureId: userData.azureId,
            email: userData.email,
            displayName: userData.name,
            role: {
              connect: { id: role.id },
            },
          },
        });

        // Assign all permissions to SUPER_ADMIN users
        if (role.name === ROLES.SUPER_ADMIN) {
          try {
            const permissions = await this.prisma.permission.findMany();
            console.log("Permissions: --> ", permissions);
            await this.prisma.userPermission.createMany({
              data: permissions.map((permission) => ({
                userId: user.id,
                permissionId: permission.id,
              })),
            });
          } catch (error) {
            console.log("Permission not found", error);
          }
        }

        this.logger.log(
          `New user created with role "${role.name}": ${user.email}`,
        );
      } else {
        this.logger.log(`Existing user authenticated: ${user.email}`);
      }

      // Generate JWT token
      const customToken = this.jwtService.sign(
        {
          sub: user.azureId,
          email: user.email,
          name: user.displayName,
        },
        {
          secret: process.env.JWT_SECRET || "jwt-secret",
          expiresIn: process.env.JWT_EXPIRY || "7d",
        },
      );

      // Set the JWT token as a cookie
      res.cookie("auth_token", customToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to the frontend
      return {
        message: "REDIRECT_TO_APPLICATION",
        data: {
          redirectURI: process.env.FRONTEND_URL,
        },
      };
    } catch (error) {
      // Handle errors only if the headers have not been sent
      if (!res.headersSent) {
        this.logger.error("Azure sign-in failed", error);
        throw error;
      } else {
        this.logger.warn("Error occurred after headers were sent. Ignoring.");
      }
    }
  }

  async azureLogin() {
    const state = randomBytes(16).toString("hex");
    const redirectUri = `${process.env.SERVER_URL}${process.env.AZURE_REDIRECT_URI}`;

    const authUrl = await this.msalClient.getAuthCodeUrl({
      redirectUri,
      scopes: ["openid", "profile", "email"],
      state,
    });

    return {
      message: "Redirect to Azure login page",
      url: authUrl,
    };
  }

  async logout(res: Response) {
    try {
      res.clearCookie("auth_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });

      this.logger.log("User logged out successfully");
      return {
        message: "Logout successful",
      };
    } catch (error) {
      this.logger.error("Logout failed", error);
      throw new Error("Logout failed");
    }
  }

  async getUserByToken(req: Request & { userDetails?: User }) {
    const { id } = req.userDetails;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: {
                      action: true,
                      description: true,
                    },
                  },
                },
              },
            },
          },
          userPermissions: {
            select: {
              permission: {
                select: {
                  action: true,
                  description: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        this.logger.warn(`User with ID ${id} not found`);
        throw new UnauthorizedException(`User with ID ${id} not found`);
      }

      const rolePermissions =
        user.role?.permissions.map((p) => p.permission.action) || [];
      const userPermissions =
        user.userPermissions.map((p) => p.permission.action) || [];

      return {
        message: "User fetched successfully",
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          displayName: user.displayName,
          role: user.role?.name,
          permissions: Array.from(
            new Set([...rolePermissions, ...userPermissions]),
          ),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch user with ID ${id}`, error);
      throw error;
    }
  }
}
