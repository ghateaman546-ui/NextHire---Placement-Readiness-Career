const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('--- [DEV] Email not sent (SMTP not configured) ---');
    console.log(`To: ${to}\nSubject: ${subject}\n${html}`);
    console.log('----------------------------------------------------');
    return { devMode: true };
  }
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.EMAIL_FROM || '"NextHire" <no-reply@example.com>',
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(to, verifyUrl) {
  return sendEmail({
    to,
    subject: 'Verify your email — NextHire',
    html: `<p>Welcome to NextHire! Verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Expires in 24 hours.</p>`,
  });
}

async function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your password — NextHire',
    html: `<p>Reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Expires in 1 hour. Ignore if you didn't request this.</p>`,
  });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
