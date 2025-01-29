export const ENV = {
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',
    AZURE_CLIENT: process.env.AZURE_CLIENT,
    AZURE_SECRETE_ID: process.env.AZURE_SECRETE_ID,
    AZURE_REDIRECT_URI: process.env.AZURE_REDIRECT_URI,
    AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
    AZURE_SECRET: process.env.AZURE_SECRET,
    JWT_SECRET: process.env.JWT_SECRET || 'jwt-secret',
}
