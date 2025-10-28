// backend/utils.js

/**
 * Centralized logger and error handler for backend server.
 * Replace with winston/morgan for advanced logging if desired.
 */

const logLevel = process.env.NODE_ENV === "production" ? "info" : "debug";

const logger = {
  info: (msg, meta = {}) => {
    if (["info", "debug"].includes(logLevel))
      console.log(`[INFO]: ${msg}`, meta);
  },
  debug: (msg, meta = {}) => {
    if (logLevel === "debug")
      console.debug(`[DEBUG]: ${msg}`, meta);
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN]: ${msg}`, meta);
  },
  error: (msg, meta = {}) => {
    console.error(`[ERROR]: ${msg}`, meta);
  },
  request: (req) => {
    logger.debug(`Incoming request: ${req.method} ${req.originalUrl}`);
  },
  handleError: (err, req, res, next) => {
    logger.error(`Error at ${req.originalUrl}: ${err.message}`, { stack: err.stack });
    res.status(err.status || 500).json({
      error: true,
      message: err.message,
      details: err.details || null,
    });
  }
};

module.exports = logger;
