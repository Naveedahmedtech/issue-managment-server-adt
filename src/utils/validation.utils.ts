import { BadRequestException } from '@nestjs/common';

export class ValidationUtils {
  /**
   * Validate a required string field.
   * @param value The field value.
   * @param fieldName The name of the field.
   */
  static validateRequiredString(value: any, fieldName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required and must be a non-empty string.`);
    }
  }

  /**
   * Validate an optional string field.
   * @param value The field value.
   * @param fieldName The name of the field.
   */
  static validateOptionalString(value: any, fieldName: string): void {
    if (value !== undefined && typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string.`);
    }
  }

  /**
   * Validate a required date field.
   * @param value The field value.
   * @param fieldName The name of the field.
   */
  static validateRequiredDate(value: any, fieldName: string): Date {
    const date = new Date(value);
    if (!value || isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is required and must be a valid date.`);
    }
    return date;
  }

  /**
   * Validate an optional date field.
   * @param value The field value.
   * @param fieldName The name of the field.
   */
  static validateOptionalDate(value: any, fieldName: string): Date | null {
    console.log("value", value)
    if (value === undefined || value === null || !value) return null;

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date.`);
    }
    return date;
  }

  /**
   * Validate that a start date is not after an end date.
   * @param startDate The start date.
   * @param endDate The end date.
   */
  static validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new BadRequestException('Start date cannot be after end date.');
    }
  }

  /**
   * Convert a value to uppercase.
   * @param value The value to convert.
   * @returns The uppercase value.
   */
  static toUpperCase(value: string): string {
    return value?.toUpperCase();
  }
}
