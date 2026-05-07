import React, { useState, useEffect, useRef } from "react";

/**
 * Componente robusto y seguro para sistemas de ventas/inventario críticos.
 * Soporta coma decimal, validación pura, precisión configurable, control de stock y UX accesible.
 */
export default function CantidadConUnidadInput({
  unidadBase,
  factorConversion,
  unidadesDisponibles,
  stockBase,
  onChange,
  initialUnidad,
  initialCantidad,
  min = 0.01,
  max = undefined,
  precision = 3,
  disabled = false,
}) {
  const defaultUnidad = initialUnidad || unidadesDisponibles[0];
  const [unidad, setUnidad] = useState(defaultUnidad);
  const [cantidad, setCantidad] = useState(
    initialCantidad === undefined || initialCantidad === null || initialCantidad === ""
      ? ""
      : String(initialCantidad).replace(".", ",")
  ); // input controlado como string
  const [error, setError] = useState("");
  const [valorBase, setValorBase] = useState(0);

  // Guardar onChange en ref para evitar loops
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setUnidad(initialUnidad || unidadesDisponibles[0]);
  }, [initialUnidad, unidadesDisponibles]);

  useEffect(() => {
    if (initialCantidad === undefined || initialCantidad === null || initialCantidad === "") {
      setCantidad("");
      return;
    }
    setCantidad(String(initialCantidad).replace(".", ","));
  }, [initialCantidad]);

  // Control de última emisión para evitar renders innecesarios
  const lastEmitted = useRef({ base: null, unidad: null, cantidad: null });

  // Funciones puras de conversión
  function convertirABase(num, unidadInput, unidadBaseInput, factorConv) {
    if (!Number.isFinite(factorConv) || factorConv <= 0) return NaN;
    if (unidadInput === unidadBaseInput) return num;
    return num / factorConv;
  }
  function convertirDesdeBase(base, unidadInput, unidadBaseInput, factorConv) {
    if (!Number.isFinite(factorConv) || factorConv <= 0) return NaN;
    if (unidadInput === unidadBaseInput) return base;
    return base * factorConv;
  }

  function formatQuantity(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    return Number(num.toFixed(3)).toString();
  }

  // Stock máximo permitido en unidad seleccionada (defensivo)
  const stockEnUnidad = convertirDesdeBase(
    stockBase,
    unidad,
    unidadBase,
    factorConversion
  );
  const stockEnUnidadSafe = Number.isFinite(stockEnUnidad) ? stockEnUnidad : 0;
  const maxPermitido = max ?? stockEnUnidadSafe;
  const step = 1 / Math.pow(10, precision);

  // Validación completamente pura
  function validarCantidad(
    cantidadStr,
    unidadSel,
    stockBaseVal,
    factorConvVal,
    stockEnUnidadVal,
    maxPermitidoVal,
    unidadBaseVal,
    precisionVal
  ) {
    if (typeof cantidadStr !== "string") return { error: "Cantidad inválida" };
    const normalized = cantidadStr.replace(",", ".").trim();
    if (!normalized) return { error: "" }; // input vacío: sin error, sin emitir cambio
    const num = Number(normalized);
    if (!Number.isFinite(num)) return { error: "Cantidad inválida" };
    if (num <= 0) return { error: "Debe ser mayor a 0" };
    // Demasiados decimales
    const decimales = normalized.split(".")[1]?.length || 0;
    if (decimales > precisionVal) return { error: `Máximo ${precisionVal} decimales` };
    // Factor inválido
    if (!Number.isFinite(factorConvVal) || factorConvVal <= 0)
      return { error: "Unidad no soportada" };
    // Conversión a base
    const base = convertirABase(num, unidadSel, unidadBaseVal, factorConvVal);
    if (!Number.isFinite(base) || base <= 0)
      return { error: "Conversión inválida" };
    // Stock dinámico
    if (!Number.isFinite(stockBaseVal) || stockBaseVal <= 0)
      return { error: "Sin stock disponible" };
    if (base > stockBaseVal)
      return {
        error: `Stock insuficiente (${formatQuantity(stockEnUnidadVal)} ${unidadSel})`,
      };
    if (
      maxPermitidoVal !== undefined &&
      Number.isFinite(maxPermitidoVal) &&
      num > maxPermitidoVal
    )
      return {
        error: `Stock insuficiente (${formatQuantity(maxPermitidoVal)} ${unidadSel})`,
      };
    return { error: "", base, num };
  }

  // Validación y conversión en tiempo real (UN solo useEffect)
  useEffect(() => {
    const normalized = cantidad.replace(",", ".").trim();
    const num = Number(normalized);
    const {
      error: err,
      base,
      num: validNum,
    } = validarCantidad(
      cantidad,
      unidad,
      stockBase,
      factorConversion,
      stockEnUnidadSafe,
      maxPermitido,
      unidadBase,
      precision
    );
    setError(err);
    if (err) {
      setValorBase(0);
      return;
    }
    setValorBase(base);
    // Evitar onChange si el valor no cambió
    if (
      lastEmitted.current.base === base &&
      lastEmitted.current.unidad === unidad &&
      lastEmitted.current.cantidad === validNum
    ) {
      return;
    }
    lastEmitted.current = { base, unidad, cantidad: validNum };
    onChangeRef.current?.(base, unidad, validNum);
    // eslint-disable-next-line
  }, [
    cantidad,
    unidad,
    stockBase,
    factorConversion,
    stockEnUnidadSafe,
    maxPermitido,
    precision,
    unidadBase,
  ]);

  // Cambio de unidad: mantener valor real, limitar decimales visualmente
  function handleUnidadChange(e) {
    const nuevaUnidad = e.target.value;
    const normalized = cantidad.replace(",", ".").trim();
    let nuevaCantidad = cantidad;
    if (normalized && Number.isFinite(Number(normalized))) {
      const base = convertirABase(
        Number(normalized),
        unidad,
        unidadBase,
        factorConversion
      );
      const raw = convertirDesdeBase(
        base,
        nuevaUnidad,
        unidadBase,
        factorConversion
      );
      if (Number.isFinite(raw)) {
        const display = Number(raw.toFixed(precision));
        // Eliminar ceros innecesarios
        const displayStr = display.toString().replace(/\.?0+$/, "");
        nuevaCantidad = displayStr;
      }
    }
    setUnidad(nuevaUnidad);
    setCantidad(nuevaCantidad);
  }

  // Input controlado como string
  function handleCantidadChange(e) {
    setCantidad(e.target.value);
  }

  // UX: bloquear input si stock 0 o factor inválido
  const inputDisabled =
    disabled ||
    !Number.isFinite(factorConversion) ||
    factorConversion <= 0 ||
    !Number.isFinite(stockBase) ||
    stockBase <= 0;

  // UX: mostrar conversión SOLO si no hay error y cantidad válida
  const normalized = cantidad.replace(",", ".").trim();
  const num = Number(normalized);
  const mostrarConversion =
    !error &&
    normalized &&
    Number.isFinite(num) &&
    num > 0 &&
    Number.isFinite(valorBase);

  // UX: mostrar stock siempre debajo del input
  const stockTexto =
    `${formatQuantity(stockBase)} ${unidadBase}` +
    (unidad !== unidadBase ? ` (${formatQuantity(stockEnUnidadSafe)} ${unidad})` : "");

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          inputMode="decimal"
          step={step}
          min={min}
          max={maxPermitido}
          value={cantidad}
          onChange={handleCantidadChange}
          disabled={inputDisabled}
          aria-invalid={!!error}
          aria-describedby="cantidad-error"
          className={`border rounded px-3 py-2 w-32 text-right ${
            error ? "border-red-500" : "border-gray-300"
          }`}
          placeholder={`Cantidad (${unidad})`}
        />
        <select
          value={unidad}
          onChange={handleUnidadChange}
          disabled={inputDisabled || unidadesDisponibles.length < 2}
          className="border rounded px-2 py-2"
        >
          {unidadesDisponibles.map((u, i) => (
            <option key={u + '-' + i} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {mostrarConversion && (
        <div className="text-xs text-gray-600">
          Equivale a <b>{formatQuantity(valorBase)} {unidadBase}</b>
        </div>
      )}
      <div className="text-xs text-gray-500">
        Stock: <b>{stockTexto}</b>
      </div>
      {error && (
        <div
          className="text-xs text-red-600 font-bold"
          id="cantidad-error"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
