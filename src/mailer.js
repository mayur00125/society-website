'use strict';

const nodemailer = require('nodemailer');

function isMailConfigured() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

async function sendResetEmail(to, resetLink) {
  if (!isMailConfigured()) {
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || 'Society',
      to,
      subject: 'Password Reset Request',
      text:
        'You requested a password reset for your society account.\n\n' +
        'Use the link below to reset your password (valid for 1 hour):\n\n' +
        resetLink +
        '\n\nIf you did not request this, please ignore this email.',
      html:
        '<p>You requested a password reset for your society account.</p>' +
        '<p>Use the link below to reset your password (valid for 1 hour):</p>' +
        '<p><a href="' + resetLink + '">' + resetLink + '</a></p>' +
        '<p>If you did not request this, please ignore this email.</p>',
    });
    return true;
  } catch (err) {
    console.error('sendResetEmail failed:', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = { isMailConfigured, sendResetEmail };
