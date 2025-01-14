import { Request, Response } from 'express';

export function rootRouteHandler(req: Request, res: Response) {
  const response = {
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1',
  };

  if (req.headers.accept?.includes('text/html')) {
    res.send(`
      <h1>🚀 Server is Running!</h1>
      <p><strong>Status:</strong> ${response.status}</p>
      <p><strong>Message:</strong> ${response.message}</p>
      <p><strong>Timestamp:</strong> ${response.timestamp}</p>
      <p><strong>Environment:</strong> ${response.environment}</p>
      <p><strong>Version:</strong> ${response.version}</p>
    `);
  } else {
    res.json(response);
  }
}
