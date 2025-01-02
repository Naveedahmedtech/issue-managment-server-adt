import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const createLogger = () => {
    return WinstonModule.createLogger({
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message }) => {
                        return `[${timestamp}] ${level}: ${message}`;
                    }),
                ),
            }),
            new winston.transports.File({
                filename: 'logs/error.log',
                level: 'error',
            }),
            new winston.transports.File({
                filename: 'logs/combined.log',
            }),
        ],
    });
};
