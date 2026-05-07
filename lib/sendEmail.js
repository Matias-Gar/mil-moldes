// lib/sendEmail.js
// Ejemplo usando Resend (https://resend.com/docs/send-with-node-sdk)

import { Resend } from 'resend';
import process from 'process';
import fs from 'fs';

if (!process.env.RESEND_API_KEY) {
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

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendResetEmail(to, code) {
    try {
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM || 'onboarding@resend.dev',
        to,
        subject: 'Recupera tu contraseña',
        html: `<p>Tu código de recuperación es: <b>${code}</b></p>`
      });
      return result;
    } catch (error) {
      console.error('Error enviando correo:', error);
      throw error;
    }
}
