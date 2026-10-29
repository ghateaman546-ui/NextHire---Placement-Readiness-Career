const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// Behind a reverse proxy (Render, Railway, Vercel, nginx, etc.) so req.ip / rate
// limiting and secure cookies read the real client IP and protocol correctly.
app.set('trust proxy', 1);

// CLIENT_URL supports a comma-separated list, e.g.
// "https://app.example.com,https://www.example.com" for prod + staging + preview URLs.
const allowedOrigins = (process.env.CLIENT_URL || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, server-to-server, health checks) with no Origin header.
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(process.env.NODE_ENV === 'production' ? morgan('combined') : morgan('dev'));
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'NextHire API is running' });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
