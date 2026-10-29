const validator = require('validator');

function validateSignup({ name, email, password }) {
  const errors = [];
  if (!name || name.trim().length < 2) errors.push('Name must be at least 2 characters.');
  if (!email || !validator.isEmail(email)) errors.push('A valid email is required.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  return errors;
}

function validateLogin({ email, password }) {
  const errors = [];
  if (!email || !validator.isEmail(email)) errors.push('A valid email is required.');
  if (!password) errors.push('Password is required.');
  return errors;
}

module.exports = { validateSignup, validateLogin };
