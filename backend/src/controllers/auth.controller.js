const bcrypt = require('bcrypt');
const { User } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { signAuthToken, generateRandomToken, hashToken } = require('../utils/token');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { validateSignup, validateLogin } = require('../validators/auth.validator');

const SALT_ROUNDS = 10;

/** POST /api/auth/signup */
exports.signup = asyncHandler(async (req, res) => {
  const { name, email, password, college } = req.body;

  const errors = validateSignup({ name, email, password });
  if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const { rawToken, hashedToken } = generateRandomToken();

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    college: college || '',
    emailVerificationToken: hashedToken,
    emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
  });

  const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${rawToken}`;
  await sendVerificationEmail(user.email, verifyUrl);

  const token = signAuthToken(user._id);
  const safeUser = user.toObject();
  delete safeUser.password;

  res.status(201).json({ success: true, token, data: safeUser });
});

/** POST /api/auth/login */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const errors = validateLogin({ email, password });
  if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  if (user.isBlocked) return res.status(403).json({ success: false, message: 'This account has been blocked.' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

  user.lastActiveDate = new Date();
  await user.save();

  const token = signAuthToken(user._id);
  const safeUser = user.toObject();
  delete safeUser.password;

  res.json({ success: true, token, data: safeUser });
});

/** POST /api/auth/verify-email */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Token is required.' });

  const hashedToken = hashToken(token);
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });
  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Email verified successfully.' });
});

/** POST /api/auth/resend-verification */
exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  // Respond generically either way to avoid leaking which emails exist.
  if (user && !user.isEmailVerified) {
    const { rawToken, hashedToken } = generateRandomToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email?token=${rawToken}`;
    await sendVerificationEmail(user.email, verifyUrl);
  }
  res.json({ success: true, message: 'If that account exists, a verification email has been sent.' });
});

/** POST /api/auth/forgot-password */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (user) {
    const { rawToken, hashedToken } = generateRandomToken();
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
    await user.save();
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }
  res.json({ success: true, message: 'If that account exists, a password reset email has been sent.' });
});

/** POST /api/auth/reset-password */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ success: false, message: 'A token and an 8+ character password are required.' });
  }

  const hashedToken = hashToken(token);
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+password');
  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });

  user.password = await bcrypt.hash(password, SALT_ROUNDS);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
});

/** GET /api/auth/me */
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

/** POST /api/auth/logout */
exports.logout = asyncHandler(async (req, res) => {
  // Stateless JWT — client discards the token. Included for API completeness
  // and as a hook point if you later add a token blacklist.
  res.json({ success: true, message: 'Logged out.' });
});
