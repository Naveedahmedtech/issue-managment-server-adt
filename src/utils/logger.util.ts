import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const createLogger = () => {
    return WinstonModule.createLogger({
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        // Check if the message is an error
                        if (meta && meta.stack) {
                            return `[${timestamp}] ${level}: ${message} - Stack: ${meta.stack}`;
                        }
                        return `[${timestamp}] ${level}: ${message}`;
                    }),
                ),
            }),
            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        if (meta && meta.stack) {
                            return `[${timestamp}] ${level}: ${message} - Stack: ${meta.stack}`;
                        }
                        return `[${timestamp}] ${level}: ${message}`;
                    }),
                ),
            }),
            new winston.transports.File({
                filename: 'logs/combined.log',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.printf(({ timestamp, level, message }) => {
                        return `[${timestamp}] ${level}: ${message}`;
                    }),
                ),
            }),
        ],
    });
};

