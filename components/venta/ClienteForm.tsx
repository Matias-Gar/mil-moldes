"use client";
import React from 'react';

interface Cliente {
  carnet?: string;
  nombre?: string;
  telefono?: string;
  nit?: string;
  email?: string;
  requiereFactura?: boolean;
  guardado?: boolean;
  existente?: boolean;
}

interface ClienteFormProps {
  cliente: Cliente;
  onChange: (campo: keyof Cliente, valor: string | boolean) => void;
  onBuscar: () => void;
  onGuardar: (accion: 'add' | 'update') => void;
  onBuscarEmailHistorico: () => void;
}

export default function ClienteForm({ cliente, onChange, onBuscar, onGuardar, onBuscarEmailHistorico: _onBuscarEmailHistorico }: ClienteFormProps) {
  const canSaveClient = Boolean(String(cliente.nombre || '').trim()) && Boolean(String(cliente.telefono || '').trim());

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Datos del Cliente</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* fila carnet con botón */}
        <div className="sm:col-span-3 flex gap-2 items-center">
          <input
            className="flex-1 border border-gray-300 bg-gray-50 text-gray-900 rounded px-3 py-2 placeholder-gray-500 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
            placeholder="Carnet / CI (opcional)"
            value={cliente.carnet}
            onChange={e => onChange('carnet', e.target.value)}
          />
          <button
            type="button"
            onClick={onBuscar}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold transition"
          >Buscar</button>
        </div>

        {/* nombre, celular, correo en la siguiente fila */}
        <input
          className="border border-gray-300 bg-gray-50 text-gray-900 rounded px-3 py-2 placeholder-gray-500 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="Nombre del cliente"
          value={cliente.nombre}
          onChange={e => onChange('nombre', e.target.value)}
        />

        <input
          className="border border-gray-300 bg-gray-50 text-gray-900 rounded px-3 py-2 placeholder-gray-500 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="Teléfono"
          value={cliente.telefono}
          onChange={e => onChange('telefono', e.target.value)}
          type="tel"
        />

        {/* nit y facturación */}
        <input
          className="border border-gray-300 bg-gray-50 text-gray-900 rounded px-3 py-2 placeholder-gray-500 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="NIT/CI"
          value={cliente.nit}
          onChange={e => onChange('nit', e.target.value)}
        />

        <input
          className="border border-gray-300 bg-gray-50 text-gray-900 rounded px-3 py-2 placeholder-gray-500 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="Correo electrónico"
          value={cliente.email}
          onChange={e => onChange('email', e.target.value)}
          type="email"
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={cliente.requiereFactura}
            onChange={e => onChange('requiereFactura', e.target.checked)}
            className="h-4 w-4 text-blue-600"
          />
          ¿Requiere factura?
        </label>

        <div className="sm:col-span-3">
          {cliente.existente ? (
            <button
              type="button"
              onClick={() => onGuardar('update')}
              disabled={!canSaveClient}
              className="w-full px-4 py-2 rounded font-semibold transition bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500"
            >
              Actualizar cliente
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onGuardar('add')}
              disabled={!canSaveClient}
              className="w-full px-4 py-2 rounded font-semibold transition bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
            >
              Añadir cliente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
