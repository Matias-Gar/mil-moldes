"use client";
import { useState } from 'react';
import Link from 'next/link';
import { filterAdminMenuByRole } from '../../lib/adminPermissions';

export default function Sidebar({ mobileOpen, setMobileOpen, userRole }) {
  const [open, setOpen] = useState({});
  const menu = filterAdminMenuByRole(userRole);

  const toggle = (idx) => {
    setOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Sidebar classes
  const sidebarBase = "fixed top-0 left-0 h-full w-64 bg-gray-900 text-white flex flex-col shadow-lg z-[99] transition-transform duration-300";
  const sidebarShow = mobileOpen ? "translate-x-0" : "-translate-x-full";

  return (
    <>
      {/* Overlay para cualquier tamaño de pantalla */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-40 z-30 transition-opacity duration-300 ${mobileOpen ? 'block' : 'hidden'}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Cerrar menú"
      />
      {/* Sidebar colapsable en todas las resoluciones */}
      <aside
        className={`${sidebarBase} ${sidebarShow}`}
        style={{ minWidth: '16rem', maxWidth: '100vw' }}
      >
        <div className="p-4 text-2xl font-bold border-b border-gray-800 flex items-center justify-between">
          <span>Panel</span>
          {/* Botón cerrar siempre visible */}
          <button
            className="text-white text-2xl ml-2 focus:outline-none"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            &times;
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="space-y-2 p-4">
            {menu.map((item, idx) => (
              <li key={item.label}>
                {Array.isArray(item.children) && item.children.length > 0 ? (
                  <>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-green-600 text-white shadow-md transform transition duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-300"
                      onClick={() => toggle(idx)}
                      aria-expanded={!!open[idx]}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 7h18M3 12h18M3 17h18" />
                      </svg>
                      <span className="font-semibold">{item.label}</span>
                      <span className="ml-auto inline-flex items-center justify-center w-6 h-6 bg-white/20 rounded-full text-xs font-medium">{open[idx] ? '−' : '+'}</span>
                    </button>

                    {open[idx] && (
                      <ul className="ml-4 mt-2 space-y-2">
                        {item.children.map((child) => (
                          <li key={child.label}>
                            <Link
                              href={child.path}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-green-600 text-white shadow-sm transform transition duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-300"
                              onClick={() => setMobileOpen(false)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              <span className="font-medium text-sm">{child.label}</span>
                              {child.path === '/admin/categorias' && (
                                <span className="ml-auto inline-flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-xs font-medium">Ver</span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.path || '#'}
                    className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-green-600 text-white shadow-md transform transition duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-300"
                    onClick={() => setMobileOpen(false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    <span className="font-semibold">{item.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
