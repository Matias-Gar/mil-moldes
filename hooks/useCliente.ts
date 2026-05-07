import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/SupabaseClient';
import { showToast } from '../components/ui/Toast';

interface Cliente {
  nombre: string;
  carnet: string;
  telefono: string;
  email: string;
  nit: string;
  guardado: boolean;
  existente: boolean;
  source: string;
  requiereFactura: boolean;
}

type GuardarAccion = 'add' | 'update';

export function useCliente(sucursalId?: string | null) {
  const [cliente, setCliente] = useState<Cliente>({
    nombre: '',
    carnet: '',
    telefono: '',
    email: '',
    nit: '',
    guardado: false,
    existente: false,
    source: '',
    requiereFactura: false
  });

  const verificarExistenciaCliente = useCallback(async (carnetRaw: string, telefonoRaw: string) => {
    const carnet = String(carnetRaw || '').trim();
    const telefono = String(telefonoRaw || '').trim();

    if (!carnet && !telefono) {
      setCliente((c: Cliente) => ({ ...c, existente: false, source: c.source === 'clientes' ? '' : c.source }));
      return;
    }

    let query = supabase.from('clientes').select('id, carnet, telefono').limit(1);
    if (sucursalId) query = query.eq('sucursal_id', sucursalId);
    if (carnet && telefono) {
      query = query.or(`carnet.eq.${carnet},telefono.eq.${telefono}`);
    } else if (carnet) {
      query = query.eq('carnet', carnet);
    } else {
      query = query.eq('telefono', telefono);
    }

    const { data, error } = await query;
    if (error) return;

    const exists = Array.isArray(data) && data.length > 0;
    setCliente((c: Cliente) => ({
      ...c,
      existente: exists,
      source: exists ? 'clientes' : (c.source === 'clientes' ? '' : c.source),
    }));
  }, [sucursalId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      verificarExistenciaCliente(cliente.carnet, cliente.telefono);
    }, 350);

    return () => clearTimeout(timer);
  }, [cliente.carnet, cliente.telefono, verificarExistenciaCliente]);

  const cambiarCampo = useCallback((campo: keyof Cliente, valor: string | boolean) => {
    setCliente((c: Cliente) => ({ ...c, [campo]: valor } as Cliente));
  }, []);

  const buscarPorCarnet = useCallback(async () => {
    const q = cliente.carnet.trim();
    if (!q) {
      showToast('Ingresa numero de carnet', 'info');
      return;
    }

    // 1) perfiles
    try {
      const { data: perfil, error: perfilErr } = await supabase
        .from('perfiles')
        .select('id, nombre, nit_ci, ci_nit, telefono, email')
        .or(`nit_ci.ilike.%${q}%,ci_nit.ilike.%${q}%`)
        .limit(1)
        .maybeSingle();
      if (!perfilErr && perfil) {
        cambiarCampo('nombre', perfil.nombre || '');
        const nitval = perfil.nit_ci || perfil.ci_nit || q;
        cambiarCampo('carnet', nitval);
        cambiarCampo('telefono', perfil.telefono || '');
        if (perfil.email) {
          cambiarCampo('email', perfil.email);
          cambiarCampo('source', 'perfiles');
        } else {
          let ventasHistQuery = supabase
            .from('ventas')
            .select('cliente_email')
            .eq('cliente_nit', nitval)
            .order('fecha', { ascending: false })
            .limit(1);
          if (sucursalId) ventasHistQuery = ventasHistQuery.eq('sucursal_id', sucursalId);
          const { data: ventasHist } = await ventasHistQuery;
          if (ventasHist && ventasHist[0]?.cliente_email) {
            cambiarCampo('email', ventasHist[0].cliente_email);
            cambiarCampo('source', 'ventas (histórico)');
          } else {
            cambiarCampo('source', 'perfiles');
          }
        }
        cambiarCampo('nit', nitval);
        cambiarCampo('guardado', false);
        return;
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // console.warn('Error perfiles', errorMessage);
    }

    // 2) clientes legacy
    try {
      let cliQuery = supabase
        .from('clientes')
        .select('id, nombre, carnet, telefono, email')
        .eq('carnet', q);
      if (sucursalId) cliQuery = cliQuery.eq('sucursal_id', sucursalId);
      const { data: cli, error: cliErr } = await cliQuery.maybeSingle();
      if (!cliErr && cli) {
        setCliente({
          nombre: cli.nombre || '',
          carnet: cli.carnet || q,
          telefono: cli.telefono || '',
          email: cli.email || '',
          nit: cli.carnet || '',
          guardado: true,
          existente: true,
          source: 'clientes',
          requiereFactura: false
        });
        return;
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // console.warn('Error clientes', errorMessage);
    }

    // 3) ventas
    try {
      let ventasByNitQuery = supabase
        .from('ventas')
        .select('cliente_nombre, cliente_telefono, cliente_email')
        .eq('cliente_nit', q)
        .order('fecha', { ascending: false })
        .limit(1);
      if (sucursalId) ventasByNitQuery = ventasByNitQuery.eq('sucursal_id', sucursalId);
      const { data: ventasByNit } = await ventasByNitQuery;
      if (ventasByNit && ventasByNit.length) {
        const v = ventasByNit[0];
        setCliente((c: Cliente) => ({
          ...c,
          nombre: v.cliente_nombre || c.nombre,
          telefono: v.cliente_telefono || c.telefono,
          email: v.cliente_email || c.email,
          source: v.cliente_email ? 'ventas' : c.source,
          guardado: false
        }));
        return;
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // console.warn('Error ventas', errorMessage);
    }

    setCliente((c: Cliente) => ({ ...c, guardado: false, existente: false, source: '' }));
    showToast('Cliente no encontrado. Puedes anadirlo para busquedas futuras.', 'info');
  }, [cliente.carnet, cambiarCampo, sucursalId]);

  const guardar = useCallback(async (accion: GuardarAccion) => {
    const nombre = cliente.nombre.trim();
    const carnet = cliente.carnet.trim();
    const telefono = cliente.telefono.trim();

    if (!nombre || !telefono) {
      return showToast('Completa al menos nombre y telefono para guardar', 'error');
    }

    if (accion === 'add') {
      try {
        if (cliente.existente) {
          return showToast('Ese cliente ya existe. Usa "Actualizar cliente".', 'info');
        }

        if (carnet) {
          let existingQuery = supabase
            .from('clientes')
            .select('id')
            .eq('carnet', carnet);
          if (sucursalId) existingQuery = existingQuery.eq('sucursal_id', sucursalId);
          const { data: existingClient, error: existingError } = await existingQuery.maybeSingle();

          if (existingError) return showToast('Error validando cliente: ' + existingError.message, 'error');
          if (existingClient) return showToast('El cliente ya existe. Usa "Actualizar cliente".', 'info');
        }

        const { error: insertError } = await supabase.from('clientes').insert([{
          nombre,
          carnet: carnet || null,
          telefono: telefono || null,
          email: cliente.email || null,
          sucursal_id: sucursalId || null
        }]);

        if (insertError) return showToast('Error al anadir cliente: ' + (insertError.message || ''), 'error');

        setCliente((c: Cliente) => ({ ...c, guardado: true, existente: true, source: 'clientes' }));
        return showToast('Cliente anadido correctamente');
      } catch (e) {
        // console.error(e);
        return showToast('Error inesperado al anadir cliente', 'error');
      }
    }

    let actualizadoEnPerfiles = false;
    let actualizadoEnClientes = false;

    try {
      if (carnet) {
        const { data: perfilExistente, error: perfilErr } = await supabase
          .from('perfiles')
          .select('id, nit_ci, ci_nit')
          .or(`nit_ci.ilike.%${carnet}%,ci_nit.ilike.%${carnet}%`)
          .limit(1)
          .maybeSingle();
        if (!perfilErr && perfilExistente) {
          const { error: upErr } = await supabase
            .from('perfiles')
            .update({
              nombre,
              telefono: telefono || null,
              email: cliente.email || null,
              nit_ci: carnet
            })
            .eq('id', perfilExistente.id);
          if (upErr) return showToast('Error al actualizar perfil: ' + upErr.message, 'error');
          actualizadoEnPerfiles = true;
        }
      }
    } catch (e) {
      // console.warn('guardarCliente perfil', e);
    }

    try {
      let updateQuery = supabase
        .from('clientes')
        .update({
          nombre,
          telefono: telefono || null,
          email: cliente.email || null,
          carnet: carnet || null,
        });
      if (sucursalId) updateQuery = updateQuery.eq('sucursal_id', sucursalId);

      if (carnet) {
        updateQuery = updateQuery.eq('carnet', carnet);
      } else {
        updateQuery = updateQuery.eq('telefono', telefono);
      }

      const { data: updatedClientes, error: updateError } = await updateQuery.select('id');

      if (updateError) return showToast('Error al actualizar cliente: ' + (updateError.message || ''), 'error');

      actualizadoEnClientes = Array.isArray(updatedClientes) && updatedClientes.length > 0;

      if (!actualizadoEnClientes && !actualizadoEnPerfiles) {
        return showToast('No se encontro cliente para actualizar. Usa "Anadir cliente".', 'info');
      }

      const source = actualizadoEnClientes
        ? (actualizadoEnPerfiles ? 'clientes y perfiles' : 'clientes')
        : 'perfiles';

      setCliente((c: Cliente) => ({ ...c, guardado: true, existente: true, source }));
      showToast(`Cliente actualizado correctamente en ${source}`);
    } catch (e) {
      // console.error(e);
      showToast('Error inesperado al actualizar cliente', 'error');
    }
  }, [cliente, sucursalId]);

  const buscarEmailHistorico = useCallback(async () => {
    try {
      const q = cliente.carnet.trim() || cliente.nit.trim();
      if (!q) return showToast('Introduce carnet o NIT para buscar email historico', 'info');
      let query = supabase.from('ventas').select('cliente_email').or(`cliente_nit.ilike.%${q}%,cliente_telefono.ilike.%${q}%`).order('fecha', { ascending: false }).limit(1);
      if (sucursalId) query = query.eq('sucursal_id', sucursalId);
      const { data } = await query;
      if (data && data[0]?.cliente_email) {
        setCliente((c: Cliente) => ({ ...c, email: data[0].cliente_email, source: 'ventas (histórico)' }));
        showToast('Email recuperado desde ventas historicas');
      } else {
        showToast('No se encontro email historico', 'info');
      }
    } catch (e) { /* console.warn(e); */ showToast('Error buscando email historico', 'error'); }
  }, [cliente.carnet, cliente.nit, sucursalId]);

  return { cliente, cambiarCampo, buscarPorCarnet, guardar, buscarEmailHistorico };
}
