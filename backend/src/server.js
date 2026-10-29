require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`NextHire API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    // Graceful shutdown so in-flight requests finish and the host's deploy
    // platform (Render, Railway, Docker, etc.) doesn't force-kill mid-request.
    const shutdown = (signal) => {
      console.log(`${signal} received: closing server...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      console.error('Unhandled promise rejection:', err);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
