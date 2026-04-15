"use client";
// app/layout.tsx
import React from "react";
import Script from "next/script";
import type { Metadata } from "next";
// 💡 NOTA: Asumo que estás usando la versión correcta de "geist/font" o "next/font/google"
// La importación de las fuentes depende de cómo las hayas instalado.
// Si usas 'next/font/google' para Geist, tu estructura de importación es correcta.
import { Geist, Geist_Mono } from "next/font/google"; 
import "./globals.css";
import Header from "../components/Header"; 
import StoreFooter from "../components/StoreFooter";
// import FacebookPixel from "../components/FacebookPixel"; 
import ToastProvider from "@/components/ui/ToastProvider";
import QZTrayLoader from "../components/QZTrayLoader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Cambié 'lang="en"' a 'lang="es"' ya que estás programando en español
      <html lang="es">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Catálogo</title>
        </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        
        {/* 💡 PASO 2: Colocar el Header antes del {children} */}
        {/* El Header aparecerá en la parte superior de todas las páginas */}
        <QZTrayLoader />
        <Header /> 
        {children}
        <StoreFooter />
        {/* 📊 Facebook Pixel para tracking */}
        {/* <FacebookPixel /> */}
        <ToastProvider />
      </body>
    </html>
  );
}