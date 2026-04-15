// lib/gmailSendEmail.js
// Enviar email usando Gmail SMTP



import fs from 'fs';

if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
  // Carga dotenv solo si no están presentes
  try {
    if (fs.existsSync('.env.local')) {
      require('dotenv').config({ path: '.env.local' });
    } else if (fs.existsSync('.env')) {
      require('dotenv').config();
    }
  } catch (e) {
    console.error('No se pudo cargar dotenv:', e);
  }
}

export async function sendResetEmailGmail(to, code) {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to,
    subject: 'Recupera tu contraseña',
    html: `<p>Tu código de recuperación es: <b>${code}</b></p>`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo enviado (Gmail):', info.response);
    return info;
  } catch (error) {
    console.error('Error enviando correo (Gmail):', error, {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS ? '***' : undefined
    });
    throw error;
  }
}
