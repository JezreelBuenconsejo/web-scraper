/**
 * 🔥 API SERVER ENTRY POINT
 * Simple entry point for starting the API server
 */

import { startServer } from './src/api/server.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

startServer(PORT).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
