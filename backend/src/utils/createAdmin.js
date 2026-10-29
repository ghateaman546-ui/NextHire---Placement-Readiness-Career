/**
 * createAdmin.js — idempotently creates (or promotes) an admin account so
 * the /admin pages have someone real to log in as. There is no public
 * signup path to the admin role by design (role defaults to 'student' and
 * nothing in the API lets a request set its own role) — this script is the
 * intended way to bootstrap the first admin account, in prod or locally.
 *
 * Run: npm run create-admin
 * Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from the environment (.env).
 * Safe to re-run: if the email already exists, it's promoted to 'admin'
 * and the password is left untouched (pass ADMIN_RESET_PASSWORD=true to
 * overwrite it too).
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const { User } = require('../models');

async function run() {
  const name = process.env.ADMIN_NAME || 'Admin';
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env before running this script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  const hashedPassword = await bcrypt.hash(password, 10);

  if (user) {
    user.role = 'admin';
    user.isBlocked = false;
    user.isEmailVerified = true;
    if (resetPassword) user.password = hashedPassword;
    await user.save();
    console.log(`✅ Existing user promoted to admin: ${email}`);
  } else {
    user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      isEmailVerified: true,
    });
    console.log(`✅ Admin account created: ${email}`);
  }

  console.log('Log in from the frontend with this email + the ADMIN_PASSWORD you set.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
