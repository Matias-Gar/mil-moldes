import React from "react";
import "./globals.css";
import Header from "../components/Header";
import StoreFooter from "../components/StoreFooter";
import ToastProvider from "@/components/ui/ToastProvider";
import QZTrayLoader from "../components/QZTrayLoader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <QZTrayLoader />
        <Header />
        {children}
        <StoreFooter />
        <ToastProvider />
      </body>
    </html>
  );
}
