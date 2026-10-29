const apiLimiter = (req, res, next) => next();
const authLimiter = (req, res, next) => next();
const aiLimiter = (req, res, next) => next();
const executeLimiter = (req, res, next) => next();

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter,
  executeLimiter
};