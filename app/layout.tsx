"use client";

import React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "../components/Header";
import StoreFooter from "../components/StoreFooter";
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
    <html lang="es" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="google" content="notranslate" />
        <title>Catalogo</title>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QZTrayLoader />
        <Header />
        {children}
        <StoreFooter />
        <ToastProvider />
      </body>
    </html>
  );
}
