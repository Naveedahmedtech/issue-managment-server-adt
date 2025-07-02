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

    // issue middleware logs
    this.$use(async (params, next) => {
      if (params.model === "Issue" && params.action === "create") {
        const result = await next(params);

        await this.issueHistory.create({
          data: {
            issueId: result.id,
            userId: result.userId,
            type: "ISSUES",
            fieldName: "Issue Created",
            oldValue: null,
            newValue: `Title: ${result.title} \n Description: ${result.description} \n Status: ${result.status}`,
          },
        });

        this.logger.log("Issue history created!");
        return result;
      }

      if (
        params.model === "ProjectChecklistItem" &&
        params.action === "update"
      ) {
        const oldItem = await this.projectChecklistItem.findUnique({
          where: { id: params.args.where.id },
        });

        const result = await next(params);
        const newItem = result;
        const changes: Array<{ field: string; oldValue: any; newValue: any }> =
          [];

        const fieldsToCheck = [
          "answer",
          "comment",
          "attachmentFileId",
          "userId",
        ];
        for (const field of fieldsToCheck) {
          const oldVal = oldItem[field];
          const newVal = newItem[field];
          if (oldVal !== newVal) {
            changes.push({
              field,
              oldValue: String(oldVal ?? ""),
              newValue: String(newVal ?? ""),
            });
          }
        }

        // Save changes to log
        await Promise.all(
          changes.map((change) =>
            this.issueHistory.create({
              data: {
                checklistItemId: newItem.id,
                fieldName: change.field,
                type: "CHECKLIST",
                oldValue: change.oldValue,
                newValue: change.newValue,
                userId: newItem.userId, // or pull from context if needed
              },
            }),
          ),
        );

        if (changes.length > 0) {
          this.logger.log(
            `Logged ${changes.length} changes for ProjectChecklistItem ${newItem.id}`,
          );
        }

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
