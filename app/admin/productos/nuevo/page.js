"use client";

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { supabase } from "../../../../lib/SupabaseClient";
import { usePathname, useRouter } from "next/navigation";
import { v4 as uuidv4 } from 'uuid';
import { getOptimizedImageUrl, buildImageSrcSet } from '../../../../lib/imageOptimization';
import { optimizeImageForUpload } from '../../../../lib/imageUploadOptimization';

import { registrarMovimientoStock } from '../../../../lib/stockMovimientos';
import { registrarHistorialProducto } from '../../../../lib/productosHistorial';
import { canAccessAdminPath } from '../../../../lib/adminPermissions';

import { sincronizarStockProducto } from '../../../../lib/utils';
import { getProductViewMeta, normalizeProductView } from '../../../../lib/productViews';
import { useSucursalActiva } from '../../../../components/admin/SucursalContext';


// Importar CantidadConUnidadInput correctamente
import CantidadConUnidadInput from '../../../../components/CantidadConUnidadInput';
// Desactivar SSR para el componente de código de barras si usa librerías de cliente como 'react-barcode'
// Si la tabla usa react-barcode, este dynamic es necesario. Si solo usa la función handlePrintBarcode, se podría quitar.
// Lo mantendremos por si acaso el componente de tabla lo usa internamente.
const Barcode = dynamic(() => import('react-barcode'), { ssr: false });
const SUPABASE_PAGE_SIZE = 1000;

const DEFAULT_COLOR_PALETTE = [
    // Colores básicos
    'Blanco',
    'Negro',
    'Gris',
    'Gris Claro',
    'Gris Oscuro',
    'Plomo',

    // Tonos de tierra
    'Beige',
    'Crema',
    'Marron',
    'Marron Claro',
    'Marron Oscuro',
    'Cafe',
    'Cafe Claro',
    'Cafe Oscuro',
    'Natural',
    'Nude',
    'Camel',
    'Taupe',

    // Rojos y derivados
    'Rojo',
    'Rojo Claro',
    'Rojo Oscuro',
    'Bordo',
    'Guindo',
    'Vino',
    'Marron Rojizo',
    'Oxido',

    // Rosados y fucsia
    'Rosado',
    'Rosado Claro',
    'Rosado Oscuro',
    'Fucsia',
    'Magenta',
    'Palo de Rosa',
    'Salmón',
    'Durazno',

    // Corales y naranjas
    'Coral',
    'Coral Claro',
    'Naranja',
    'Naranja Claro',
    'Naranja Oscuro',
    'Mandarina',

    // Amarillos
    'Amarillo',
    'Amarillo Claro',
    'Amarillo Oscuro',
    'Mostaza',
    'Oro',
    'Dorado',
    'Lima',

    // Verdes
    'Verde',
    'Verde Claro',
    'Verde Oscuro',
    'Verde Militar',
    'Oliva',
    'Kaki',
    'Salvia',
    'Menta',
    'Verde Agua',
    'Pistacho',
    'Esmeralda',

    // Azules
    'Azul',
    'Azul Claro',
    'Azul Oscuro',
    'Navy',
    'Real',
    'Celeste',
    'Cielo',
    'Turquesa',
    'Teal',
    'Petroleo',
    'Acero Azulado',

    // Morados y violetas
    'Morado',
    'Morado Claro',
    'Morado Oscuro',
    'Violeta',
    'Lila',
    'Lavanda',
    'Berenjena',
    'Purpura',
    'Ciruela',

    // Metalizados
    'Plateado',
    'Plata',
    'Gris Metalizad',
    'Plomo Metalizad',

    // Tonos especiales
    'Transparente',
    'Traslucido',
    'Plateado Brillante',
    'Dorado Brillante',
    'Coppel',
    'Bronce',
    'Cobre',

    // Combinaciones clasicas
    'Blanco con Negro',
    'Blanco con Dorado',
    'Blanco con Plateado',
    'Blanco con Rojo',
    'Blanco con Azul',
    'Blanco con Verde',
    'Negro con Dorado',
    'Negro con Plateado',
    'Negro con Rojo',
    'Negro con Blanco',
    'Rojo con Negro',
    'Rojo con Blanco',
    'Rojo con Oro',
    'Azul con Blanco',
    'Azul con Negro',
    'Azul con Oro',
    'Verde con Negro',
    'Verde con Blanco',
    'Verde con Dorado',
    'Rosado con Blanco',
    'Beige con Dorado',
    'Gris con Blanco',
    'Marron con Crema',
    'Cafe con Crema',
    'Cafe con Blanco',
    'Navy con Blanco',
    'Navy con Coral',
    'Bordo con Dorado',
    'Guindo con Dorado',
    'Morado con Plata',
    'Turquesa con Blanco',
    'Emerald con Dorado',

    // Especiales
    'Multicolor',
    'Animal Print',
    'Rayas',
    'Cuadros',
    'Flores',
    'Geometrico',
    'Degradado',
    'Ombre',
    'Tie Dye',
    'Marmol',
    'Lentejuela',
    'Iridiscente',
    'Holografico',
    'Denin',
    'Unico',
];

const COLOR_COMBINATION_METALS = ['Dorado', 'Plateado'];
const AUTO_GENERATED_COLOR_COMBINATIONS = Array.from(
    new Set(
        DEFAULT_COLOR_PALETTE
            .filter((color) => !/\scon\s/i.test(color))
            .filter((color) => !COLOR_COMBINATION_METALS.includes(color))
            .flatMap((color) => COLOR_COMBINATION_METALS.map((metal) => `${color} con ${metal}`))
    )
);

function generateVariantBarcode(existingCodes = new Set()) {
    let code = '';
    do {
        code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    } while (existingCodes.has(code));
    return code;
}

function createVariantDraft(existingVariants = [], overrides = {}) {
    const existingCodes = new Set(
        (existingVariants || [])
            .map((variant) => String(variant?.codigo_barra || variant?.sku || '').trim())
            .filter(Boolean)
    );
    const code = generateVariantBarcode(existingCodes);
    return {
        color: '',
        stock: '',
        precio: '',
        sku: code,
        codigo_barra: code,
        activo: true,
        ...overrides,
        sku: overrides.sku ?? code,
        codigo_barra: overrides.codigo_barra ?? code,
    };
}

// --------------------------------------------------------------------------
// COMPONENTE 1: Modal de Vista Previa de Imagen (IMAGEN COMPLETA)
// --------------------------------------------------------------------------
function ImagePreviewModal({ isOpen, onClose, imageList, imageIndex, productName, onPrev, onNext }) {
    if (!isOpen || !imageList || imageList.length === 0) return null;
    const modalImage = imageList[imageIndex];
    return (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center p-2 sm:p-4 z-[999]" onClick={onClose}>
            <div className="relative w-full h-full max-w-screen-2xl max-h-[95vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white text-4xl font-extrabold z-50 opacity-75 hover:opacity-100 transition"
                    aria-label="Cerrar vista previa"
                >
                    &times;
                </button>
                <img
                    src={getOptimizedImageUrl(modalImage, 2200, { quality: 99, format: 'origin' })}
                    srcSet={buildImageSrcSet(modalImage, [900, 1400, 2200], { quality: 99, format: 'origin' })}
                    sizes="(max-width: 768px) 100vw, 90vw"
                    loading="lazy"
                    decoding="async"
                    alt={`Vista previa de ${productName}`}
                    className="max-w-full max-h-full object-scale-down rounded-lg shadow-2xl"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-center p-2 rounded-b-lg text-sm opacity-80">
                    {productName} ({imageIndex + 1} / {imageList.length})
                </div>
                {imageList.length > 1 && (
                    <>
                        <button onClick={onPrev} className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-3xl font-bold bg-black bg-opacity-40 rounded-full px-3 py-1 hover:bg-opacity-70">&#8592;</button>
                        <button onClick={onNext} className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-3xl font-bold bg-black bg-opacity-40 rounded-full px-3 py-1 hover:bg-opacity-70">&#8594;</button>
                    </>
                )}
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// COMPONENTE 3: Modal para Seleccionar Colores a Imprimir
// --------------------------------------------------------------------------
function PrintVariantesModal({
    isOpen,
    onClose,
    product,
    variantes,
    onPrint,
    selectedColors,
    onColorToggle,
    onToggleAll,
    qzHealth,
    onCheckQz,
    cutMode,
    showQzStatus,
}) {
    if (!isOpen || !product) return null;

    const allSelected = variantes && variantes.length > 0 && variantes.every(v => selectedColors[v.id]);
    const anySelected = variantes && variantes.some(v => selectedColors[v.id]);

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-gray-800">Seleccionar Colores para Imprimir</h3>
                <p className="text-sm text-gray-600 mb-4">Producto: <b>{product.nombre}</b></p>

                <div className="space-y-3 max-h-96 overflow-y-auto mb-6 border rounded-lg p-4 bg-gray-50">
                    {variantes && variantes.length > 0 ? (
                        variantes.map((v) => (
                            <label key={v.id} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-2 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={selectedColors[v.id] || false}
                                    onChange={() => onColorToggle(v.id)}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    {v.color} (Stock: {v.stock}) - Código: <b>{v.codigo_barra || v.sku || 'Sin código'}</b>
                                </span>
                            </label>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No hay colores disponibles</p>
                    )}
                </div>

                <div className="flex justify-between mb-4">
                    <button
                        type="button"
                        onClick={() => onToggleAll(!allSelected)}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                        {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                    <span className="text-sm text-gray-600">
                        {Object.values(selectedColors).filter(Boolean).length} / {variantes?.length || 0} seleccionados
                    </span>
                </div>

                <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800">
                    Se imprimirá 1 etiqueta por cada color seleccionado en este catálogo.
                </div>

                {showQzStatus && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="font-semibold text-gray-800">Estado de impresión automática</span>
                        <button
                            type="button"
                            onClick={onCheckQz}
                            disabled={qzHealth?.loading}
                            className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                        >
                            {qzHealth?.loading ? 'Verificando...' : 'Verificar'}
                        </button>
                    </div>
                    <div className="space-y-1 text-xs">
                        <div className={qzHealth?.installed ? 'text-green-700' : 'text-red-700'}>
                            QZ Tray: {qzHealth?.installed ? 'Conectado' : 'No disponible'}
                        </div>
                        <div className={qzHealth?.printerReady ? 'text-green-700' : 'text-amber-700'}>
                            Impresora POS-80C: {qzHealth?.printerReady ? 'Detectada' : 'No detectada'}
                        </div>
                        <div className={(qzHealth?.installed && qzHealth?.printerReady) ? 'text-green-700' : 'text-amber-700'}>
                            Corte QZ: {cutMode === 'raw-per-copy'
                                ? ((qzHealth?.installed && qzHealth?.printerReady) ? 'Por etiqueta' : 'No disponible')
                                : cutMode === 'qz-html-per-label'
                                    ? ((qzHealth?.installed && qzHealth?.printerReady) ? 'Por etiqueta (diseño HTML)' : 'No disponible')
                                : cutMode === 'browser-per-label'
                                    ? ((qzHealth?.installed && qzHealth?.printerReady) ? 'Por etiqueta (mantiene diseño)' : 'No disponible')
                                    : cutMode === 'browser-final'
                                    ? ((qzHealth?.installed && qzHealth?.printerReady) ? 'Solo corte final' : 'No disponible')
                                    : 'Desactivado'}
                        </div>
                        {qzHealth?.error && (
                            <div className="text-red-700">Detalle: {qzHealth.error}</div>
                        )}
                    </div>
                </div>
                )}

                <div className="flex justify-end space-x-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => onPrint()}
                        disabled={!anySelected}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Imprimir Seleccionados
                    </button>
                </div>
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// COMPONENTE 2: Modal de Confirmacion de Eliminacion
// --------------------------------------------------------------------------
function DeleteConfirmationModal({ isOpen, onClose, onConfirm, productName }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-sm p-6 rounded-xl shadow-2xl">
                <h3 className="text-xl font-bold mb-4 text-red-700">Confirmar eliminacion</h3>
                <p className="text-gray-700 mb-6">Estas seguro de que quieres eliminar el producto <b>{productName}</b>? Esta accion no se puede deshacer.</p>
                <div className="flex justify-end space-x-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                        S?, Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// Lógica para subir la imagen a Supabase Storage (¡REVISAR RLS DE STORAGE!)
// --------------------------------------------------------------------------
const uploadProductImages = async (files) => {
    if (!files || files.length === 0) return [];
    const BUCKET_NAME = 'product_images';
    // Usar un prefijo genérico para todos los usuarios (no requiere login para ver)
    const userId = 'public';

    const uploadTasks = files.map(async (file) => {
        const { file: preparedFile } = await optimizeImageForUpload(file, {
            maxDimension: 2600,
            targetMaxBytes: 2.8 * 1024 * 1024,
            hardMaxBytes: 4.2 * 1024 * 1024,
            preferredQuality: 0.98,
            minQuality: 0.9,
        });

        const fileExtension = (preparedFile.name.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${uuidv4()}.${fileExtension}`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, preparedFile, {
                cacheControl: '31536000',
                upsert: false,
                contentType: preparedFile.type || 'image/jpeg'
            });

        if (uploadError) {
            throw new Error(`Error al subir imagen a storage (Bucket: ${BUCKET_NAME}): ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    });

    return Promise.all(uploadTasks);
};

function isMissingColumnError(error, columnName) {
    return String(error?.message || '').toLowerCase().includes(String(columnName).toLowerCase());
}

function omitSucursalId(payload) {
    const { sucursal_id, ...rest } = payload;
    return rest;
}

async function insertWithOptionalSucursal(tableName, payloadOrPayloads, options = {}) {
    const payloads = Array.isArray(payloadOrPayloads) ? payloadOrPayloads : [payloadOrPayloads];
    const runInsert = (nextPayloads) => {
        const query = supabase.from(tableName).insert(nextPayloads);
        return options.select ? query.select() : query;
    };

    let result = await runInsert(payloads);

    if (result.error && isMissingColumnError(result.error, 'sucursal_id')) {
        result = await runInsert(payloads.map(omitSucursalId));
    }

    return result;
}

// --------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------------------------------
export default function AdminProductosPage() {
    // HOOKS AL INICIO
    const router = useRouter();
    const pathname = usePathname();
    const { activeSucursalId } = useSucursalActiva();
    const currentProductView = normalizeProductView(pathname?.includes('/admin/insumos') ? 'insumos' : 'articulos');
    const currentViewMeta = getProductViewMeta(currentProductView);
    const [userRole, setUserRole] = useState(null);
    // Estado para el modal de colores repetidos
    const [showColorRepeatModal, setShowColorRepeatModal] = useState(false);
    // Estado para advertencia de nombre duplicado
    const [showNameRepeatModal, setShowNameRepeatModal] = useState(false);
    const [productos, setProductos] = useState([]);
    const [imagenesProductos, setImagenesProductos] = useState({});
    const [variantesProductos, setVariantesProductos] = useState({});
    const newImageInputRef = useRef(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [categories, setCategories] = useState([]);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [selectedImageList, setSelectedImageList] = useState([]);
    const [selectedImageName, setSelectedImageName] = useState('');
    const [filterText, setFilterText] = useState('');
    const [filterLatest, setFilterLatest] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState('all');

    const [newProduct, setNewProduct] = useState({
        nombre: '',
        descripcion: '',
        precio: '',
        precio_compra: '',
        category_id: '',
        codigo_barra: '',
        vista_producto: currentProductView,
        unidad_base: 'unidad', // Ej: 'rollo', 'litro', 'unidad'
        unidades_alternativas: [], // Ej: ['metro', 'ml', 'unidad']
        factor_conversion: 1 // Ej: 50 (1 rollo = 50 metros)
    });
        // Opciones de unidades típicas
        const unidadOptions = [
            'unidad', 'rollo', 'metro', 'litro', 'ml', 'kg', 'g', 'paquete', 'caja', 'par', 'docena', 'pieza', 'bulto', 'galón', 'cm', 'mm', 'm', 'l', 'cl', 'botella', 'frasco', 'tableta', 'otro'
        ];
        const conversionSuggestionsByBase = {
            rollo: ['metro', 'cm', 'mm'],
            metro: ['cm', 'mm', 'rollo'],
            m: ['cm', 'mm'],
            litro: ['ml', 'cl', 'galÒ³n', 'botella', 'frasco'],
            l: ['ml', 'cl', 'botella', 'frasco'],
            ml: ['litro', 'cl', 'frasco'],
            cl: ['ml', 'litro'],
            kg: ['g'],
            g: ['kg'],
            caja: ['unidad', 'paquete', 'pieza'],
            paquete: ['unidad', 'pieza'],
            docena: ['unidad'],
            par: ['unidad'],
            botella: ['ml', 'litro'],
            frasco: ['ml', 'litro'],
            bulto: ['paquete', 'unidad'],
            unidad: ['caja', 'paquete', 'par', 'docena'],
        };
        const smartAlternativeOptions = (conversionSuggestionsByBase[newProduct.unidad_base] || [])
            .filter((u, idx, arr) => u !== newProduct.unidad_base && arr.indexOf(u) === idx);

    const [newVariants, setNewVariants] = useState(() => [
        createVariantDraft([], { color: '' })
    ]);
    const [editingProduct, setEditingProduct] = useState(null);
    const [editImageFiles, setEditImageFiles] = useState([]);
    const [editImageList, setEditImageList] = useState([]); // URLs actuales
    const [imageFiles, setImageFiles] = useState([]); // Para alta
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Estados para el modal de impresión de variantes
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [productToPrint, setProductToPrint] = useState(null);
    const [selectedColorsToPrint, setSelectedColorsToPrint] = useState({});
    const [qzHealth, setQzHealth] = useState({
        loading: false,
        installed: false,
        printerReady: false,
        error: ''
    });

    // Nuevo: estado y carga de promociones
    const [promociones, setPromociones] = useState([]);
    const [activeColorRow, setActiveColorRow] = useState(null);

    const normalizeText = (text = '') =>
        String(text)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const getColorSuggestions = (value = '') => {
        const query = normalizeText(value);
        const cleanOptions = colorOptions
            .map(displayColorValue)
            .filter((color) => color && !/^[?�]/.test(color))
            .filter((color, index, arr) => arr.indexOf(color) === index);
        if (!query) return cleanOptions.slice(0, 8);

        const startsWith = cleanOptions.filter((c) => normalizeText(c).startsWith(query));
        const includes = cleanOptions.filter(
            (c) => !startsWith.includes(c) && normalizeText(c).includes(query)
        );
        return [...startsWith, ...includes].slice(0, 8);
    };

    const selectColorSuggestion = (rowIndex, colorValue) => {
        handleVariantChange(rowIndex, 'color', colorValue);
        setActiveColorRow(null);
    };

    const displayColorValue = (value = '') => {
        const text = String(value || '');
        if (/^[?�]+nico$/i.test(text)) return 'Unico';
        return text.replace(/Ãšnico|Ãºnico/g, 'Unico');
    };

    const colorOptions = Array.from(
        new Set(
            [
                ...DEFAULT_COLOR_PALETTE,
                ...AUTO_GENERATED_COLOR_COMBINATIONS,
                ...Object.values(variantesProductos)
                    .flat()
                    .map((v) => String(v?.color || '').trim())
                    .filter(Boolean),
            ].map(displayColorValue)
                .map((c) => c.trim())
                .filter((c) => c && !/^[?�]/.test(c))
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    useEffect(() => {
        async function loadPromociones() {
            try {
                const { data, error } = await supabase.from("promociones").select("*");
                if (!error && Array.isArray(data)) setPromociones(data);
                else if (error) console.warn("Error cargando promociones:", error);
            } catch (e) {
                console.error("Excepción cargando promociones:", e);
            }
        }
        loadPromociones();
    }, []);

    const QZ_PRINTER_NAME = 'POS-80C';
    const ENABLE_QZ_RAW_LABEL_PRINT = false;
    const ENABLE_QZ_HTML_LABEL_PRINT = false;
    const ENABLE_QZ_DIRECT_VARIANT_PRINT = true;
    const ENABLE_QZ_CUT_PER_LABEL_WITH_BROWSER_PRINT = false;
    const ENABLE_QZ_CUT_ONLY_AFTER_BROWSER_PRINT = false;
    const ENABLE_QZ_PRODUCT_LABEL_FLOW =
        ENABLE_QZ_RAW_LABEL_PRINT ||
        ENABLE_QZ_HTML_LABEL_PRINT ||
        ENABLE_QZ_CUT_PER_LABEL_WITH_BROWSER_PRINT ||
        ENABLE_QZ_CUT_ONLY_AFTER_BROWSER_PRINT;

    const loadQzTray = () => new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('QZ Tray solo está disponible en navegador.'));
            return;
        }

        if (window.qz) {
            resolve(window.qz);
            return;
        }

        const existing = document.getElementById('qz-tray-script');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.qz));
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar QZ Tray.')));
            return;
        }
        // Ya no se carga por CDN, solo se usa window.qz global
        reject(new Error('QZ Tray no está disponible.'));
    });

    const ensureQzConnection = async () => {
        const qz = await loadQzTray();
        if (!qz) throw new Error('QZ Tray no disponible.');

        // Configuración de desarrollo para facilitar conexión local.
        if (qz.security) {
            qz.security.setCertificatePromise((resolve) => resolve(null));
            qz.security.setSignaturePromise(() => (resolve) => resolve(''));
        }

        if (!qz.websocket.isActive()) {
            await qz.websocket.connect({ retries: 1, delay: 0 });
        }

        return qz;
    };

    const buildEscPosBarcodeCommand = (value) => {
        const text = String(value || '').trim();
        const digitsOnly = /^\d+$/.test(text);

        // Solo usar EAN13 cuando llegan exactamente 12 dígitos.
        // Para 13+ se respeta el valor completo usando CODE128.
        if (digitsOnly && text.length === 12) {
            const ean12 = text.slice(0, 12);
            return `\x1D\x6B\x02${ean12}\x00`;
        }

        // CODE128 con Set B para contenido alfanumérico general.
        const code128 = `{B${text || '000000'}}`;
        return `\x1D\x6B\x49${String.fromCharCode(code128.length)}${code128}`;
    };

    const tryPrintBarcodeWithQz = async ({ barcodeValue, productName, copies }) => {
        try {
            const qz = await ensureQzConnection();
            const printer = await qz.printers.find(QZ_PRINTER_NAME);
            if (!printer) throw new Error(`No se encontró la impresora ${QZ_PRINTER_NAME}.`);
            const config = qz.configs.create(printer, { encoding: 'CP1252' });

            for (let i = 0; i < copies; i++) {
                const raw = [
                    '\x1B\x40',                 // init
                    '\x1B\x61\x01',           // align center
                    '\x1D\x48\x00',           // HRI off (lo imprimimos manual)
                    '\x1D\x68\x46',           // barcode height
                    '\x1D\x77\x01',           // barcode module width (evita recorte lateral)
                    buildEscPosBarcodeCommand(barcodeValue),
                    '\n',
                    `${String(barcodeValue || '').slice(0, 32)}\n`,
                    `${String(productName || '').slice(0, 32)}\n`,
                    '\x1B\x64\x03',           // feed 3 lines antes de cortar
                    '\x1D\x56\x00'            // full cut
                ].join('');

                await qz.print(config, [raw]);
            }

            return true;
        } catch (err) {
            console.warn('QZ Tray no disponible, se usa impresión del navegador.', err);
            return false;
        }
    };

    const tryCutOnlyWithQz = async ({ cuts = 1 } = {}) => {
        const qzCutEnabled =
            ENABLE_QZ_CUT_PER_LABEL_WITH_BROWSER_PRINT ||
            ENABLE_QZ_CUT_ONLY_AFTER_BROWSER_PRINT;
        if (!qzCutEnabled) return false;
        const safeCuts = Math.max(0, Math.min(200, Number(cuts) || 0));
        if (safeCuts === 0) return false;

        try {
            const qz = await ensureQzConnection();
            const printer = await qz.printers.find(QZ_PRINTER_NAME);
            if (!printer) throw new Error(`No se encontró la impresora ${QZ_PRINTER_NAME}.`);
            const config = qz.configs.create(printer, { encoding: 'CP1252' });

            for (let i = 0; i < safeCuts; i++) {
                await qz.print(config, ['\x1D\x56\x00']);
            }

            return true;
        } catch (err) {
            console.warn('No se pudo ejecutar corte por QZ Tray.', err);
            return false;
        }
    };

    const tryPrintHtmlLabelWithQz = async ({ labelHtml, copies, enabled = ENABLE_QZ_HTML_LABEL_PRINT }) => {
        if (!enabled) return false;
        try {
            const qz = await ensureQzConnection();
            const printer = await qz.printers.find(QZ_PRINTER_NAME);
            if (!printer) throw new Error(`No se encontró la impresora ${QZ_PRINTER_NAME}.`);

            const pixelConfig = qz.configs.create(printer);
            const safeCopies = Math.max(1, Math.min(200, Number(copies) || 1));

            for (let i = 0; i < safeCopies; i++) {
                await qz.print(pixelConfig, [{
                    type: 'pixel',
                    format: 'html',
                    flavor: 'plain',
                    data: labelHtml,
                }]);
                if (i < safeCopies - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 120));
                }
            }

            return true;
        } catch (err) {
            console.warn('No se pudo imprimir HTML por QZ Tray.', err);
            return false;
        }
    };

    const checkQzHealth = async () => {
        if (!ENABLE_QZ_PRODUCT_LABEL_FLOW) {
            setQzHealth({
                loading: false,
                installed: false,
                printerReady: false,
                error: 'QZ Tray desactivado en esta pantalla.'
            });
            return;
        }

        setQzHealth((prev) => ({ ...prev, loading: true, error: '' }));
        try {
            const qz = await ensureQzConnection();
            const printer = await qz.printers.find(QZ_PRINTER_NAME);
            setQzHealth({
                loading: false,
                installed: true,
                printerReady: Boolean(printer),
                error: ''
            });
        } catch (err) {
            setQzHealth({
                loading: false,
                installed: false,
                printerReady: false,
                error: err?.message || 'No se pudo verificar QZ Tray.'
            });
        }
    };

        const handlePrintBarcode = async (codigo, productoNombre = '', copies = 1, printMode = 'browser') => {
      const rawCode = String(codigo || '').trim();
      const productName = String(productoNombre || '').trim() || 'SIN NOMBRE';
      const barcodeValue = rawCode || '0000000000000';
            const safeCopies = Math.max(1, Math.min(200, Number(copies) || 1));
                        const labelWidthMm = 70;
                        const labelHeightMm = 22;

            const shouldUseQzRaw = printMode === 'qz-raw' && ENABLE_QZ_RAW_LABEL_PRINT;
            const shouldUseQzHtml = printMode === 'qz-html' && ENABLE_QZ_DIRECT_VARIANT_PRINT;

            const qzPrinted = shouldUseQzRaw
                ? await tryPrintBarcodeWithQz({
                    barcodeValue,
                    productName,
                    copies: safeCopies,
                })
                : false;

            if (qzPrinted) {
                setMessage('Etiquetas enviadas por QZ Tray con corte por cada copia.');
                return;
            }

            let svgString = '';
      try {
        const JsBarcode = (await import('jsbarcode')).default;
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                const digitsOnly = /^\d+$/.test(barcodeValue);
                const canUseEAN = digitsOnly && (barcodeValue.length === 12 || barcodeValue.length === 13);
        JsBarcode(svgEl, barcodeValue, {
                    format: canUseEAN ? 'EAN13' : 'CODE128',
          displayValue: false,
          width: 1.2,
          height: 35,
          margin: 0,
        });
        svgString = new XMLSerializer().serializeToString(svgEl);
            } catch (_err) {
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="40">
          <text x="0" y="20">${barcodeValue}</text>
        </svg>`;
      }

      const barcodeDataUri = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;

            const buildLabelMarkup = () => `
                <div class="sheet">
                    <div class="label">
                        <div class="left">
                            <img src="${barcodeDataUri}" />
                            <div class="code">${barcodeValue}</div>
                        </div>
                        <div class="right">${productName}</div>
                    </div>
                </div>
            `;

            const labelsHtml = Array.from({ length: safeCopies }).map(() => buildLabelMarkup()).join('');

            const buildPrintHtml = (labelsMarkup) => `
      <html>
      <head>
        <style>
                    @page {
                        size: ${labelWidthMm}mm auto;
                        margin: 0;
                    }

          html, body {
            width: ${labelWidthMm}mm;
                        margin: 0;
                        padding: 0;
                        height: auto;
                        font-family: Arial, sans-serif;
                    }

                    body {
                        background: white;
                        display: block;
                    }

                    .sheet {
                        width: ${labelWidthMm}mm;
                        min-height: ${labelHeightMm}mm;
                        margin: 0;
                        padding: 0;
                        break-after: auto;
                        page-break-after: auto;
                    }

          .label {
            width: ${labelWidthMm}mm;
                        min-height: ${labelHeightMm}mm;
            box-sizing: border-box;
            padding: 1mm;
            display: flex;
            border: 1px solid black;
            overflow: hidden;
          }

          .left {
            width: 48mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }

          .left img {
            width: 100%;
          }

          .code {
            font-size: 9pt;
          }

          .right {
                        width: calc(${labelWidthMm}mm - 48mm - 2mm);
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
            font-size: 8pt;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
                                ${labelsMarkup}

      </body>
      </html>
      `;

            const qzHtmlPrinted = shouldUseQzHtml
                ? await tryPrintHtmlLabelWithQz({
                    labelHtml: buildPrintHtml(buildLabelMarkup()),
                    copies: safeCopies,
                    enabled: true,
                })
                : false;

            if (qzHtmlPrinted) {
                setMessage('Etiquetas impresas por QZ Tray con corte por cada etiqueta.');
                return;
            }

        const printInIframe = (htmlContent) => new Promise((resolve) => {
        let iframe = document.getElementById('barcode-print-iframe');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'barcode-print-iframe';
          iframe.style.position = 'fixed';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          iframe.style.visibility = 'hidden';
          document.body.appendChild(iframe);
        }

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc) {
                        resolve(false);
                        return;
                }

        doc.open();
        doc.write(htmlContent);
        doc.close();

                setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
                        resolve(true);
          } catch (err) {
            console.warn('Impresión desde iframe falló', err);
                        resolve(false);
          }
        }, 500);
            });

            if (!ENABLE_QZ_RAW_LABEL_PRINT && ENABLE_QZ_CUT_PER_LABEL_WITH_BROWSER_PRINT) {
                for (let i = 0; i < safeCopies; i++) {
                        await printInIframe(buildPrintHtml(buildLabelMarkup()));
                    // Pequeña espera para evitar cortar antes de que termine de salir la etiqueta.
                    await new Promise((resolve) => setTimeout(resolve, 900));
                    // Cortar solo entre etiquetas evita un corte adicional al final.
                    if (i < safeCopies - 1) {
                        await tryCutOnlyWithQz({ cuts: 1 });
                    }
                        if (i < safeCopies - 1) {
                                await new Promise((resolve) => setTimeout(resolve, 250));
                        }
                }
                return;
            }

            await printInIframe(buildPrintHtml(labelsHtml));

            // Mantiene exactamente el diseño actual y delega a QZ solo el corte final.
            if (!ENABLE_QZ_RAW_LABEL_PRINT && ENABLE_QZ_CUT_ONLY_AFTER_BROWSER_PRINT) {
                    await tryCutOnlyWithQz({ cuts: 1 });
            }
    };

        const handlePrintBarcodeRef = useRef(handlePrintBarcode);
        handlePrintBarcodeRef.current = handlePrintBarcode;

    // Listener para imprimir código de barras de variante
    useEffect(() => {
      const handlePrintVariantBarcode = async (event) => {
            const { codigoBarras, nombre, copies, printMode } = event.detail;
        if (!codigoBarras) return;

        // Usar la función existente handlePrintBarcode
                        await handlePrintBarcodeRef.current(codigoBarras, nombre, copies, printMode || 'qz-html');
      };

      window.addEventListener('printVariantBarcode', handlePrintVariantBarcode);
      return () => window.removeEventListener('printVariantBarcode', handlePrintVariantBarcode);
        }, []);

    useEffect(() => {
        if (isPrintModalOpen && ENABLE_QZ_PRODUCT_LABEL_FLOW) {
            checkQzHealth();
        }
    }, [isPrintModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Función para abrir modal de impresión de variantes
        const getPrintableVariantes = (producto) => {
            if (!producto) return [];
            const raw = variantesProductos[producto.user_id] || [];
            if (raw.length > 0) {
                return raw.map((v) => ({
                    ...v,
                    codigo_barra: v.codigo_barra || v.sku || ''
                }));
            }

            return [];
        };

    const openPrintVariantesModal = (producto) => {
      setProductToPrint(producto);
      setSelectedColorsToPrint({});
      setIsPrintModalOpen(true);
    };

    // Función para manejar toggle de colores
    const handleColorToggle = (varianteId) => {
      setSelectedColorsToPrint(prev => ({
        ...prev,
        [varianteId]: !prev[varianteId]
      }));
    };

        const handleToggleAllColors = (shouldSelect) => {
            const variantes = productToPrint ? getPrintableVariantes(productToPrint) : [];
            const newSelection = {};
            variantes.forEach((v) => {
                newSelection[v.id] = shouldSelect;
            });
            setSelectedColorsToPrint(newSelection);
        };

    // Función para imprimir múltiples variantes
    const handlePrintMultipleVariantes = async () => {
      if (!productToPrint) return;

            const variantes = getPrintableVariantes(productToPrint);
      const selectedVariantes = variantes.filter(v => selectedColorsToPrint[v.id]);

            if (selectedVariantes.length === 0) {
                setMessage('Selecciona al menos un color para imprimir.');
                return;
            }

      // Imprimir cada variante con un pequeño delay entre ellas
      for (let i = 0; i < selectedVariantes.length; i++) {
        const variante = selectedVariantes[i];
                                const codigo = variante.codigo_barra || variante.sku;
                if (!codigo) continue;
                                                                await handlePrintBarcode(codigo, `${productToPrint.nombre} - ${variante.color}`, 1, 'browser');
        // Esperar un poco antes de la siguiente impresión
        if (i < selectedVariantes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setIsPrintModalOpen(false);
      setProductToPrint(null);
      setSelectedColorsToPrint({});
    };


    // useEffect de autenticación y rol
    useEffect(() => {
        const checkAuthAndRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                setUserRole('not_logged');
                return;
            }
            // Verificar el rol en la base de datos
            const { data: profile, error } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', user.id)
                .single();
            if (error || !profile) {
                setUserRole('cliente');
                router.push('/');
                return;
            }
            if (!canAccessAdminPath(profile.rol, '/admin/productos/nuevo')) {
                setUserRole(profile.rol);
                router.push('/');
                return;
            }
            setUserRole(profile.rol);
        };
        checkAuthAndRole();
    }, [router]);

    // --- FUNCIONES ---

    const nextImage = () => {
        setSelectedImageIndex((prev) => (prev + 1) % selectedImageList.length);
    };
    const prevImage = () => {
        setSelectedImageIndex((prev) => (prev - 1 + selectedImageList.length) % selectedImageList.length);
    };

    // Función auxiliar que faltaba para abrir el modal de imagen
    const openImageModal = (list, index, name) => {
        setSelectedImageList(list);
        setSelectedImageIndex(index);
        setSelectedImageName(name);
        setIsImageModalOpen(true);
    };

    const handleNewProductChange = (e) => {
        const { name, value } = e.target;
        if (name === 'category_id' && value === 'create') {
            try { sessionStorage.setItem('pendingProduct', JSON.stringify(newProduct)); } catch {};
            router.push('/admin/categorias?return=productos_nuevo');
            return;
        }
        if (name === 'unidad_base') {
            const allowedAlternatives = conversionSuggestionsByBase[value] || [];
            setNewProduct((prev) => {
                if (value === 'unidad') {
                    return {
                        ...prev,
                        unidad_base: value,
                        unidades_alternativas: [],
                        factor_conversion: ''
                    };
                }
                const alternativasActuales = Array.isArray(prev.unidades_alternativas)
                    ? prev.unidades_alternativas.filter((u) => allowedAlternatives.includes(u))
                    : [];
                return {
                    ...prev,
                    unidad_base: value,
                    unidades_alternativas: alternativasActuales,
                    factor_conversion: alternativasActuales.length > 0 ? prev.factor_conversion : ''
                };
            });
            return;
        }
        setNewProduct({ ...newProduct, [name]: value });
    };

    const handleVariantChange = (index, field, value) => {
        setNewVariants(prev => prev.map((v, i) => {
            if (i !== index) return v;
            if (field === 'codigo_barra') {
                return { ...v, codigo_barra: value, sku: value };
            }
            if (field === 'sku') {
                return { ...v, sku: value, codigo_barra: value };
            }
            return { ...v, [field]: value };
        }));
    };

    const addVariantRow = () => {
        setNewVariants(prev => [...prev, createVariantDraft(prev)]);
    };

    const removeVariantRow = (index) => {
        setNewVariants(prev => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleEditProductChange = (e) => {
        setEditingProduct({ ...editingProduct, [e.target.name]: e.target.value });
    };

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        setImageFiles(prev => [...prev, ...files]);
    };

    const handleEditImageChange = (e) => {
        setEditImageFiles(prev => [...prev, ...Array.from(e.target.files)]);
    };

    // Eliminar imagen existente de la lista local (no borra de storage hasta guardar)
    const handleRemoveEditImage = (url) => {
        setEditImageList(editImageList.filter(img => img !== url));
    };

    const closeEditModal = () => {
        setEditingProduct(null);
        setEditImageFiles([]);
        setEditImageList([]);
        setMessage('');
    };

    const openEditModal = (producto) => {
        setEditingProduct(producto);
        setEditImageFiles([]);
        setEditImageList(imagenesProductos[producto.user_id] || []);
        setMessage('');
    };

    // --------------------------------------------------------------------------
    // FUNCIONES DE SUPABASE
    // --------------------------------------------------------------------------

    // Función para cargar categorías
    const fetchCategories = async () => {
        let query = supabase
            .from('categorias')
            .select('id, categori')
            .order('categori', { ascending: true });
        if (activeSucursalId) query = query.eq('sucursal_id', activeSucursalId);
        const { data, error } = await query;
        if (error) {
            setCategories([]);
            setMessage('Error al cargar categorias.');
            return;
        }
        setCategories(data || []);
    }

    // Función para cargar productos y sus imágenes
    const fetchProductos = async () => {
        if (!canAccessAdminPath(userRole, '/admin/productos/nuevo')) {
            return;
        }
        setLoading(true);
        let data = null;
        let error = null;
        let query = supabase
            .from('productos')
            .select(`
                user_id,
                nombre,
                descripcion,
                precio,
                precio_compra,
                stock,
                imagen_url,
                category_id,
                vista_producto,
                codigo_barra,
                created_at,
                categorias (categori)
            `)
            .eq('archivado', false)
            .order('created_at', { ascending: false });
        if (activeSucursalId) query = query.eq('sucursal_id', activeSucursalId);
        let response = await query;

        data = response.data;
        error = response.error;

        if (error && String(error.message || '').includes('vista_producto')) {
            let fallbackQuery = supabase
                .from('productos')
                .select(`
                    user_id,
                    nombre,
                    descripcion,
                    precio,
                    precio_compra,
                    stock,
                    imagen_url,
                    category_id,
                    codigo_barra,
                    created_at,
                    categorias (categori)
                `)
                .eq('archivado', false)
                .order('created_at', { ascending: false });
            if (activeSucursalId) fallbackQuery = fallbackQuery.eq('sucursal_id', activeSucursalId);
            response = await fallbackQuery;

            data = response.data;
            error = response.error;
        }

        if (error) {
            setMessage(`Error al cargar productos: ${error.message || JSON.stringify(error)}.`);
            console.error("Error en fetchProductos:", error);
            setLoading(false);
            return;
        }
        const formattedData = (data || []).map(p => ({
            ...p,
            vista_producto: normalizeProductView(p.vista_producto),
            category_name: p.categorias ? p.categorias.categori : 'Sin Categoría'
        }));
        setProductos(formattedData);

        // 2. Traer imágenes de todos los productos
        const ids = formattedData.map(p => p.user_id);
        if (ids.length > 0) {
            let imgs = [];
            let imgsError = null;
            let from = 0;
            while (true) {
                let imagesQuery = supabase
                    .from('producto_imagenes')
                    .select('producto_id, imagen_url')
                    .in('producto_id', ids);
                if (activeSucursalId) imagesQuery = imagesQuery.eq('sucursal_id', activeSucursalId);
                imagesQuery = imagesQuery
                    .order('id', { ascending: true })
                    .range(from, from + SUPABASE_PAGE_SIZE - 1);
                const { data, error } = await imagesQuery;
                if (error) {
                    imgsError = error;
                    break;
                }
                imgs = [...imgs, ...(data || [])];
                if (!data || data.length < SUPABASE_PAGE_SIZE) break;
                from += SUPABASE_PAGE_SIZE;
            }
            if (!imgsError && imgs) {
                // Agrupar por producto_id y filtrar URLs vacías/nulas/incorrectas
                const agrupadas = {};
                imgs.forEach(img => {
                    if (
                        typeof img.imagen_url === 'string' &&
                        img.imagen_url.trim().length > 0 &&
                        img.imagen_url.startsWith('http')
                    ) {
                        if (!agrupadas[img.producto_id]) agrupadas[img.producto_id] = [];
                        agrupadas[img.producto_id].push(img.imagen_url);
                    }
                });
                setImagenesProductos(agrupadas);
            }

            let variantsQuery = supabase
                .from('producto_variantes')
                .select('id, producto_id, color, stock, precio, sku, activo')
                .in('producto_id', ids)
                .order('color', { ascending: true });
            if (activeSucursalId) variantsQuery = variantsQuery.eq('sucursal_id', activeSucursalId);
            const { data: varsData, error: varsError } = await variantsQuery;
            if (!varsError && Array.isArray(varsData)) {
                const grouped = {};
                varsData.forEach(v => {
                    if (!grouped[v.producto_id]) grouped[v.producto_id] = [];
                    grouped[v.producto_id].push(v);
                });
                setVariantesProductos(grouped);
            }
        } else {
            setImagenesProductos({});
            setVariantesProductos({});
        }
        setLoading(false);
    };

    // useEffect para cargar categorías y productos después de declarar las funciones
    useEffect(() => {
        // Solo cargar datos si el rol no se ha determinado o es admin
        if ((userRole && canAccessAdminPath(userRole, '/admin/productos/nuevo')) || userRole === null) {
            fetchCategories();
            fetchProductos();
        }

        // Listener de tiempo real
        const channel = supabase
            .channel('productos-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'productos' },
                (_payload) => {
                    fetchProductos();
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [userRole, currentProductView, activeSucursalId]); // eslint-disable-line react-hooks/exhaustive-deps

    // load saved form if returning from otra página
    const restoredRef = useRef(false);
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem('pendingProduct');
            if (saved) {
                const parsed = JSON.parse(saved);
                setNewProduct((prev) => ({
                    ...prev,
                    ...parsed,
                    vista_producto: normalizeProductView(parsed?.vista_producto || prev.vista_producto || currentProductView),
                }));
            }
        } catch (e) {
            console.warn('no se pudo restaurar producto pendiente', e);
        }
        restoredRef.current = true;
    }, [currentProductView]);

    // store form in sessionStorage whenever cambia, but skip initial render
    useEffect(() => {
        if (!restoredRef.current) return;
        try {
            sessionStorage.setItem('pendingProduct', JSON.stringify(newProduct));
        } catch {}
    }, [newProduct]);

    const confirmMissingProductData = ({ descripcion, imageCount, actionLabel }) => {
        const missing = [];
        if (!String(descripcion || '').trim()) {
            missing.push('descripción');
        }
        if ((Number(imageCount) || 0) <= 0) {
            missing.push('fotos');
        }
        if (missing.length === 0) return true;

        const detail = missing.length === 1
            ? `Te falta ${missing[0]}`
            : `Te faltan ${missing.join(' y ')}`;

        return window.confirm(`${detail}. Estas seguro de ${actionLabel} sin estos datos?`);
    };


    // Funcion para anadir producto
    const handleAnadirProducto = async (e) => {
        e.preventDefault();
        setMessage("");

        const canContinue = confirmMissingProductData({
            descripcion: newProduct?.descripcion,
            imageCount: imageFiles?.length || 0,
            actionLabel: "anadir el producto",
        });
        if (!canContinue) {
            setMessage("Operacion cancelada. Completa descripcion o fotos si deseas.");
            return;
        }

        setLoading(true);
        // Validar nombre duplicado antes de guardar
        let duplicateQuery = supabase
            .from("productos")
            .select("user_id")
            .ilike("nombre", newProduct.nombre.trim());
        if (activeSucursalId) duplicateQuery = duplicateQuery.eq('sucursal_id', activeSucursalId);
        const { data: productosConNombre, error: errorNombre } = await duplicateQuery;
        if (!errorNombre && productosConNombre && productosConNombre.length > 0) {
            setShowNameRepeatModal(true);
            setLoading(false);
            return;
        }

        let imagenUrls = [];
        try {
            // Subir imágenes ANTES de insertar en la tabla
            if (imageFiles && imageFiles.length > 0) {
                imagenUrls = await uploadProductImages(imageFiles);
                // Filtrar URLs vacías, nulas o inválidas
                imagenUrls = imagenUrls.filter(url => typeof url === 'string' && url.trim().length > 0 && url.startsWith('http'));
            }
            const categoryIdValue = newProduct.category_id ? parseInt(newProduct.category_id) : null;
            const usedVariantCodes = new Set();
            const variantsPayload = (newVariants || [])
                .map((v) => {
                    let finalSku = String(v.codigo_barra || v.sku || '').trim();
                    if (!finalSku || usedVariantCodes.has(finalSku)) {
                        finalSku = generateVariantBarcode(usedVariantCodes);
                    }
                    usedVariantCodes.add(finalSku);
                    const normalizedColor = String(v.color || '').trim() || 'Unico';
                    return {
                    color: normalizedColor,
                    stock: Math.max(0, Number(String(v.stock || 0).replace(',', '.')) || 0),
                    precio: v.precio === '' ? null : (parseFloat(String(v.precio).replace(',', '.')) || 0),
                    sku: finalSku,
                    activo: v.activo !== false
                };});


            const normalizedColors = variantsPayload.map(v => v.color.toLowerCase());
            if (new Set(normalizedColors).size !== normalizedColors.length) {
                setShowColorRepeatModal(true);
                setMessage('Hay colores repetidos en las variantes. Corrige antes de guardar.');
                setLoading(false);
                return;
            }

            if (variantsPayload.length === 0) {
                throw new Error('Debes agregar al menos una variante.');
            }

            const stockTotal = variantsPayload.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
            const codigoBarra = String(newProduct.codigo_barra || '').trim() || null;

            const unidadBaseNormalizada = String(newProduct.unidad_base || 'unidad').trim() || 'unidad';
            const unidadesAlternativasNormalizadas = Array.isArray(newProduct.unidades_alternativas)
                ? newProduct.unidades_alternativas.map((u) => String(u || '').trim()).filter(Boolean)
                : [];
            const factorConversionNormalizado = Number(newProduct.factor_conversion) > 0 ? Number(newProduct.factor_conversion) : null;
            const vistaProductoNormalizada = normalizeProductView(newProduct.vista_producto);

            const baseInsertPayload = {
                nombre: newProduct.nombre,
                descripcion: newProduct.descripcion,
                precio: parseFloat(newProduct.precio) || 0,
                precio_compra: parseFloat(newProduct.precio_compra) || 0,
                stock: stockTotal,
                category_id: categoryIdValue,
                codigo_barra: codigoBarra,
                imagen_url: null,
                sucursal_id: activeSucursalId || null,
                created_at: new Date().toISOString()
            };

            const extendedInsertPayload = {
                ...baseInsertPayload,
                vista_producto: vistaProductoNormalizada,
                unidad_base: unidadBaseNormalizada,
                unidades_alternativas: unidadesAlternativasNormalizadas,
                factor_conversion: factorConversionNormalizado,
            };

            let productoInsertado = null;
            let insertError = null;

            ({ data: productoInsertado, error: insertError } = await insertWithOptionalSucursal('productos', extendedInsertPayload, { select: true }));

            if (insertError) {
                const rawMessage = String(insertError.message || '');
                const missingViewColumn = rawMessage.includes('vista_producto');
                const missingUnitColumns =
                    rawMessage.includes('factor_conversion') ||
                    rawMessage.includes('unidad_base') ||
                    rawMessage.includes('unidades_alternativas');

                const needsViewColumn = vistaProductoNormalizada !== 'articulos';
                const needsUnitColumns =
                    unidadBaseNormalizada !== 'unidad' ||
                    unidadesAlternativasNormalizadas.length > 0 ||
                    Number(factorConversionNormalizado || 0) > 0;

                if ((missingViewColumn && needsViewColumn) || (missingUnitColumns && needsUnitColumns)) {
                    const missingScripts = [];
                    if (missingUnitColumns) missingScripts.push('scripts/add_product_unit_columns.sql');
                    if (missingViewColumn) missingScripts.push('scripts/add_product_view_column.sql');
                    throw new Error(`Tu base de datos aun no tiene las columnas necesarias. Ejecuta ${missingScripts.join(' y ')} en Supabase y vuelve a intentar.`);
                }

                if (missingViewColumn || missingUnitColumns) {
                    const fallbackPayload = { ...baseInsertPayload };
                    ({ data: productoInsertado, error: insertError } = await insertWithOptionalSucursal('productos', fallbackPayload, { select: true }));
                }
            }

            if (insertError) {
                throw new Error(String(insertError.message || insertError));
            }

            const productoId = productoInsertado?.[0]?.id ?? productoInsertado?.[0]?.user_id;

            // Insertar las imágenes en la tabla producto_imagenes
            if (productoId && imagenUrls.length > 0) {
                const imagesToInsert = imagenUrls.map(url => ({ producto_id: productoId, imagen_url: url, sucursal_id: activeSucursalId || null }));
                const { error: imgInsertError } = await insertWithOptionalSucursal('producto_imagenes', imagesToInsert);
                if (imgInsertError) {
                    // Si falla la inserción, intentar borrar las imágenes subidas al storage
                    for (const url of imagenUrls) {
                        try {
                            const path = url.split('/').slice(-2).join('/'); // public/uuid.jpg
                            await supabase.storage.from('product_images').remove([path]);
                        } catch {}
                    }
                    setImageFiles([]);
                    throw new Error(`Error al insertar imágenes: ${imgInsertError.message}`);
                }
            }

            // Insertar variantes por color
            if (productoId) {
                const finalVariants = variantsPayload.map((v) => ({
                    producto_id: productoId,
                    color: v.color,
                    stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
                    stock_decimal: Number(v.stock) || 0,
                    stock_inicial: Math.max(0, Math.floor(Number(v.stock) || 0)),
                    stock_inicial_decimal: Number(v.stock) || 0,
                    precio: v.precio,
                    sku: v.sku,
                    imagen_url: null,
                    sucursal_id: activeSucursalId || null,
                    activo: v.activo
                }));
                const { error: variantsError } = await insertWithOptionalSucursal('producto_variantes', finalVariants);
                if (variantsError) {
                    throw new Error(`Error al insertar variantes: ${variantsError.message}`);
                }

                // --- Sincronizar stock del producto como suma de variantes ---
                await sincronizarStockProducto(productoId, supabase);
            }

            // Registrar movimiento de creación en stock_movimientos y historial
                        try {
                                const user = (await supabase.auth.getUser())?.data?.user;
                                // Registrar un evento de stock_inicial por cada variante
                                if (productoId && Array.isArray(variantsPayload)) {
                                    for (const v of variantsPayload) {
                                        // Buscar la variante insertada para obtener su id
                                        const { data: varianteData } = await supabase
                                            .from('producto_variantes')
                                            .select('id')
                                            .eq('producto_id', productoId)
                                            .eq('color', v.color)
                                            .eq('sku', v.sku)
                                            .maybeSingle();
                                        await registrarMovimientoStock({
                                            producto_id: productoId,
                                            variante_id: varianteData?.id || null,
                                            tipo: 'stock_inicial',
                                            cantidad: v.stock,
                                            unidad: unidadBaseNormalizada,
                                            cantidad_base: v.stock,
                                            usuario_id: user?.id || null,
                                            usuario_email: user?.email || '',
                                            sucursal_id: activeSucursalId || null,
                                            observaciones: `Stock inicial para variante ${v.color}`
                                        });
                                    }
                                }
                                // (Opcional) Registrar evento global de creación para legacy
                                await registrarMovimientoStock({
                                    producto_id: productoId,
                                    tipo: 'creación',
                                    cantidad: stockTotal,
                                    unidad: unidadBaseNormalizada,
                                    cantidad_base: stockTotal,
                                    usuario_id: user?.id || null,
                                    usuario_email: user?.email || '',
                                    sucursal_id: activeSucursalId || null,
                                    observaciones: 'Alta de producto desde panel'
                                });
                                await registrarHistorialProducto({
                                    producto_id: productoId,
                                    accion: "CREATE",
                                    sucursal_id: activeSucursalId || null,
                                    datos_anteriores: null,
                                    datos_nuevos: {
                                        nombre: newProduct.nombre,
                                        descripcion: newProduct.descripcion,
                                        precio: parseFloat(newProduct.precio) || 0,
                                        precio_compra: parseFloat(newProduct.precio_compra) || 0,
                                        stock: stockTotal,
                                        category_id: categoryIdValue,
                                        codigo_barra: codigoBarra
                                    },
                                    usuario_email: user?.email || null
                                });
                        } catch (err) {
                                console.warn('No se pudo registrar movimiento/historial de creacion:', err);
                        }
            setMessage('Producto creado con exito!');
            // Limpieza reforzada de todos los campos y sessionStorage
            setNewProduct({ nombre: '', descripcion: '', precio: '', precio_compra: '', category_id: '', codigo_barra: '', vista_producto: currentProductView, unidad_base: 'unidad', unidades_alternativas: [], factor_conversion: 1 });
            setNewVariants([createVariantDraft([], { color: '' })]);
            setImageFiles([]);
            setTimeout(() => {
                sessionStorage.removeItem('pendingProduct');
                if (newImageInputRef.current) {
                    newImageInputRef.current.value = '';
                }
            }, 100);
            fetchProductos();
        } catch (e) {
            console.error("Error critico al crear producto:", e);
            setMessage(`Error critico al crear: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (producto) => {
        setProductToDelete(producto);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!productToDelete) return;

        setShowDeleteModal(false);
        setIsDeleting(true);
        setMessage('');

        try {
            // 1. Eliminar movimientos de stock relacionados
            const { error: movError } = await supabase
                .from('stock_movimientos')
                .delete()
                .eq('producto_id', productToDelete.user_id)
                .eq(activeSucursalId ? 'sucursal_id' : 'producto_id', activeSucursalId || productToDelete.user_id);
            if (movError) throw new Error('Error al eliminar movimientos de stock: ' + movError.message);

            // 2. Eliminar historial de producto relacionado
            const { error: histError } = await supabase
                .from('productos_historial')
                .delete()
                .eq('producto_id', productToDelete.user_id)
                .eq(activeSucursalId ? 'sucursal_id' : 'producto_id', activeSucursalId || productToDelete.user_id);
            if (histError) throw new Error('Error al eliminar historial: ' + histError.message);

            // 3. Eliminar el producto (la eliminacion en cascada deberia manejar imagenes y variantes)
            let deleteProductQuery = supabase
                .from('productos')
                .delete()
                .eq('user_id', productToDelete.user_id);
            if (activeSucursalId) deleteProductQuery = deleteProductQuery.eq('sucursal_id', activeSucursalId);
            const { error } = await deleteProductQuery;

            if (error) {
                throw new Error(error.message);
            }

            setMessage(`Producto "${productToDelete.nombre}" eliminado con exito.`);
            fetchProductos();
        } catch (e) {
            setMessage(`Error al eliminar: ${e.message}`);
        } finally {
            setIsDeleting(false);
            setProductToDelete(null);
        }
    };

    const handleGuardarEdicion = async (e) => {
        e.preventDefault();
        if (!editingProduct) return;

        setMessage('');

        const totalImagesAfterSave = (editImageList?.length || 0) + (editImageFiles?.length || 0);
        const canContinue = confirmMissingProductData({
            descripcion: editingProduct?.descripcion,
            imageCount: totalImagesAfterSave,
            actionLabel: 'guardar los cambios',
        });
        if (!canContinue) {
            setMessage('Operacion cancelada. Completa descripcion o fotos si deseas.');
            return;
        }

        setLoading(true);
        try {
            // 1. Subir nuevas imágenes si hay
            let nuevasUrls = [];
            if (editImageFiles && editImageFiles.length > 0) {
                nuevasUrls = await uploadProductImages(editImageFiles);
            }

            // 2. Actualizar producto (sin tocar imagen_url principal)
            const categoryIdValue = editingProduct.category_id ? parseInt(editingProduct.category_id) : null;
            let updateQuery = supabase
                .from('productos')
                .update({
                    nombre: editingProduct.nombre,
                    descripcion: editingProduct.descripcion,
                    precio: parseFloat(editingProduct.precio) || 0,
                    precio_compra: parseFloat(editingProduct.precio_compra) || 0,
                    stock: Math.max(0, Number(String(editingProduct.stock || 0).replace(',', '.')) || 0),
                    category_id: categoryIdValue,
                    vista_producto: normalizeProductView(editingProduct.vista_producto || currentProductView),
                    // Dejamos el codigo_barra para que no se re-genere si se guarda sin querer
                    codigo_barra: editingProduct.codigo_barra
                })
                .eq('user_id', editingProduct.user_id);
            if (activeSucursalId) updateQuery = updateQuery.eq('sucursal_id', activeSucursalId);
            const { error: updateError } = await updateQuery;
            if (updateError) {
                throw new Error(updateError.message);
            }
            await sincronizarStockProducto(editingProduct.user_id, supabase);

            // 3. Eliminar imágenes quitadas (de la tabla producto_imagenes)
            const originales = imagenesProductos[editingProduct.user_id] || [];
            // Comparamos las URLs originales con las que quedaron en editImageList
            const urlsAEliminar = originales.filter(url => !editImageList.includes(url));

            if (urlsAEliminar.length > 0) {
                // Eliminamos las referencias de la tabla producto_imagenes
                let deleteImagesQuery = supabase.from('producto_imagenes')
                    .delete()
                    .in('imagen_url', urlsAEliminar)
                    .eq('producto_id', editingProduct.user_id);
                if (activeSucursalId) deleteImagesQuery = deleteImagesQuery.eq('sucursal_id', activeSucursalId);
                const { error: deleteImgError } = await deleteImagesQuery;

                if(deleteImgError) console.error("Error al eliminar referencias de imágenes:", deleteImgError.message);

                // NOTA: ELIMINAR del Storage es más complejo y no está implementado aquí,
                // ya que requeriría el path exacto del archivo, no solo la URL pública.
                // Esto es una mejora pendiente.
            }

            // 4. Insertar nuevas imágenes
            if (nuevasUrls.length > 0) {
                // Filtrar URLs vacías, nulas o inválidas antes de insertar
                const validUrls = nuevasUrls.filter(url => typeof url === 'string' && url.trim().length > 0 && url.startsWith('http'));
                if (validUrls.length > 0) {
                    const imagesToInsert = validUrls.map(url => ({ producto_id: editingProduct.user_id, imagen_url: url, sucursal_id: activeSucursalId || null }));
                    const { error: imgInsertError } = await insertWithOptionalSucursal('producto_imagenes', imagesToInsert);
                    if (imgInsertError) {
                        throw new Error(imgInsertError.message);
                    }
                }
            }

            setMessage(`Producto "${editingProduct.nombre}" actualizado con exito.`);
            closeEditModal();
            fetchProductos();
        } catch (e) {
            setMessage(`Error al actualizar: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Si no es admin, no renderizar nada (o un mensaje de acceso denegado)
    if (userRole === 'not_logged') {
        return <div className="p-8 text-center text-xl text-gray-500">Redirigiendo a Login...</div>;
    }
    if (!canAccessAdminPath(userRole, '/admin/productos/nuevo')) {
        return <div className="p-8 text-center text-xl text-red-500">Acceso Denegado. No tiene permisos de Administrador.</div>;
    }

    // utilidad: formatea números a moneda local (PEN)
    function formatPrice(v) {
      if (v == null) return "S/. 0.00";
      const num = Number(v) || 0;
      try {
        return num.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
      } catch {
        return `S/. ${num.toFixed(2)}`;
      }
    }

    // Filtrar el catálogo por texto (nombre, código y categoría) y aplicar orden por último ingreso
    const filteredProductos = productos
      .filter((producto) => {
        if (!filterText || filterText.trim() === '') return true;
        const text = filterText.trim().toLowerCase();
        const nombre = String(producto.nombre || '').toLowerCase();
        const codigo = String(producto.codigo_barra || '').toLowerCase();
        const category = String(producto.category_name || '').toLowerCase();
        return nombre.includes(text) || codigo.includes(text) || category.includes(text);
      })
      .filter((producto) => {
        if (!categoryFilter || categoryFilter === 'all') return true;
        const catId = String(producto.category_id || '').toLowerCase();
        const catName = String(producto.category_name || '').toLowerCase();
        return catId === categoryFilter || catName === categoryFilter;
      })
      .sort((a, b) => {
        if (filterLatest) {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        }
        return 0;
      });

    // Componente que muestra el precio aplicando una promoción si existe.
    // Usa formatPrice definido en este archivo (asegúrate que exista).
    function PrecioConPromocion({ producto, promociones = [] }) {
      const basePrice = Number(producto?.precio ?? producto?.price ?? 0);

      if (!Array.isArray(promociones) || promociones.length === 0) {
        return <span>{formatPrice(basePrice)}</span>;
      }

      const ahora = new Date();
      const prodId = Number(producto?.user_id ?? producto?.id ?? producto?.producto_id);

      const promo = promociones.find(p => {
        const pProdId = Number(p.producto_id ?? p.productoId ?? p.product_id);
        if (Number.isNaN(pProdId) || pProdId !== prodId) return false;
        if (p.activa === false) return false;
        const inicio = p.fecha_inicio ? new Date(p.fecha_inicio) : null;
        const fin = p.fecha_fin ? new Date(p.fecha_fin) : null;
        if (inicio && ahora < inicio) return false;
        if (fin && ahora > fin) return false;
        return true;
      });

      if (!promo) return <span>{formatPrice(basePrice)}</span>;

      // calcular precio final
      let finalPrice = basePrice;
      const tipo = String(promo.tipo || "").toLowerCase();
      const valor = Number(promo.valor ?? promo.value ?? promo.amount ?? 0) || 0;
      if (tipo === "porcentaje" || tipo === "percent" || tipo === "%") {
        finalPrice = basePrice * (1 - valor / 100);
      } else {
        finalPrice = Math.max(0, basePrice - valor);
      }

      return (
        <div>
          <div>
            <span style={{ textDecoration: "line-through", color: "#6b7280", marginRight: 8 }}>{formatPrice(basePrice)}</span>
            <span style={{ fontWeight: 700, color: "#16a34a" }}>{formatPrice(finalPrice)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {promo.tipo ? `Promoción: ${promo.tipo}` : "Promoción activa"} {valor ? ` ⬢ ${valor}` : ""}
          </div>
        </div>
      );
    }

    // Retorno del JSX del componente
    return (
        <div className="p-4 sm:p-6 md:p-10 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-extrabold mb-8 text-indigo-700">{currentViewMeta.adminTitle}</h1>

            {/* Seccion de Mensajes (exito/Error) */}
            {message && (
                <div className={`p-4 mb-6 rounded-lg font-medium shadow-md ${message.startsWith('Error')
                    ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message}
                </div>
            )}

            {/* 1. Formulario de Anadir Producto */}
            <div className="bg-white p-4 sm:p-5 rounded-xl shadow-lg mb-6 border-t-4 border-indigo-500">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">{currentViewMeta.createTitle}</h2>
                <form onSubmit={handleAnadirProducto} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input
                                        type="text"
                                        name="nombre"
                                        placeholder="Nombre del Producto"
                                        value={newProduct.nombre}
                                        onChange={handleNewProductChange}
                                        required
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 placeholder-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                <input
                                        type="number"
                                        name="precio_compra"
                                        placeholder="Precio de Compra (Bs)"
                                        value={newProduct.precio_compra}
                                        onChange={handleNewProductChange}
                                        required
                                        step="0.01"
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 placeholder-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                <input
                                        type="number"
                                        name="precio"
                                        placeholder="Precio de Venta (Bs)"
                                        value={newProduct.precio}
                                        onChange={handleNewProductChange}
                                        required
                                        step="0.01"
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 placeholder-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                                />
                                {/* NUEVO: Unidad base */}
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-gray-700">Unidad base</label>
                                    <select
                                        name="unidad_base"
                                        value={newProduct.unidad_base}
                                        onChange={handleNewProductChange}
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                    >
                                        {unidadOptions.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                                {newProduct.unidad_base !== 'unidad' && (
                                    <>
                                        {/* NUEVO: Unidad alternativa */}
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-gray-700">Unidad alternativa</label>
                                            {smartAlternativeOptions.length > 0 ? (
                                                <>
                                                    <select
                                                        name="unidad_alternativa_select"
                                                        value={Array.isArray(newProduct.unidades_alternativas) ? (newProduct.unidades_alternativas[0] || '') : ''}
                                                        onChange={(e) => setNewProduct((p) => ({
                                                            ...p,
                                                            unidades_alternativas: e.target.value ? [e.target.value] : [],
                                                            factor_conversion: e.target.value ? p.factor_conversion : ''
                                                        }))}
                                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                                    >
                                                        <option value="">-- Sin unidad alternativa --</option>
                                                        {smartAlternativeOptions.map((unidadAlternativa) => (
                                                            <option key={unidadAlternativa} value={unidadAlternativa}>
                                                                {unidadAlternativa}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p className="mt-1 text-xs text-gray-600">
                                                        Opciones compatibles para <span className="font-semibold">{newProduct.unidad_base}</span>.
                                                    </p>
                                                </>
                                            ) : (
                                                    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500">
                                                    No hay conversiones sugeridas para esta unidad base.
                                                </div>
                                            )}
                                        </div>
                                        {/* NUEVO: Factor de conversión */}
                                        <div>
                                            <label className="mb-1 block text-sm font-semibold text-gray-700">
                                                Factor de conversión (1 {newProduct.unidad_base} = ? {Array.isArray(newProduct.unidades_alternativas) && newProduct.unidades_alternativas.length > 0
                                                    ? newProduct.unidades_alternativas[0]
                                                    : 'unidad'})
                                            </label>
                                            <input
                                                type="number"
                                                name="factor_conversion"
                                                value={newProduct.factor_conversion ?? ''}
                                                min={0.0001}
                                                step={0.0001}
                                                onChange={e => setNewProduct(p => ({ ...p, factor_conversion: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                                                placeholder="Ej: 50 (1 rollo = 50 metros)"
                                                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-900 placeholder-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </>
                                )}
                                {/* Selección de Categoría */}
                                <select
                                        name="vista_producto"
                                        value={newProduct.vista_producto}
                                        onChange={handleNewProductChange}
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                        <option value="articulos">Vista: Articulos</option>
                                        <option value="insumos">Vista: Insumos</option>
                                </select>
                                <select
                                        name="category_id"
                                        value={newProduct.category_id}
                                        onChange={handleNewProductChange}
                                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                >
                                        <option value="">-- Seleccionar Categoría --</option>
                                        {categories && categories.length > 0 && categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.categori}</option>
                                        ))}
                                        <option value="create" className="font-semibold text-blue-700">+ Agregar categoría</option>
                                </select>
                        </div> {/* cierre del grid principal */}

                    <div className="relative overflow-visible rounded-lg bg-gray-50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Colores disponibles</h3>
                            <button
                                type="button"
                                onClick={addVariantRow}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 text-sm rounded-lg transition"
                            >
                                + Agregar color
                            </button>
                        </div>
                        {newVariants.length === 0 ? (
                            <div className="text-sm text-gray-500">Sin colores. Agrega al menos uno.</div>
                        ) : (
                            <div className="space-y-2 overflow-visible">
                                <div className="grid grid-cols-[minmax(150px,1.35fr)_78px_140px_88px_108px_40px_40px] gap-1.5 px-1 text-xs font-semibold text-slate-700">
                                    <span>Color</span>
                                    <span>Stock</span>
                                    <span>Precio</span>
                                    <span>Unidad base</span>
                                    <span>Conversion</span>
                                    <span></span>
                                    <span></span>
                                </div>
                                {newVariants.map((variant, idx) => (
                                    <div
                                        key={`variant-${idx}`}
                                        className="grid grid-cols-[minmax(150px,1.35fr)_78px_140px_88px_108px_40px_40px] items-center gap-1.5"
                                    >
                                        <div className="contents">
                                            <div className="relative">
                                                <label className="hidden">Color</label>
                                                <input
                                                    type="text"
                                                    value={displayColorValue(variant.color)}
                                                    onFocus={() => setActiveColorRow(idx)}
                                                    onBlur={() => setTimeout(() => setActiveColorRow((current) => (current === idx ? null : current)), 120)}
                                                    onChange={(e) => {
                                                        handleVariantChange(idx, 'color', e.target.value);
                                                        setActiveColorRow(idx);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') setActiveColorRow(null);
                                                    }}
                                                    placeholder="Color (ej: Rojo)"
                                                    autoComplete="off"
                                                    className="h-8 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                                />
                                                {activeColorRow === idx && getColorSuggestions(variant.color).length > 0 && (
                                                    <div className="absolute z-20 mt-1 w-full max-h-36 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                                                        {getColorSuggestions(variant.color).map((color) => (
                                                            <button
                                                                key={`${idx}-${color}`}
                                                                type="button"
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    selectColorSuggestion(idx, color);
                                                                }}
                                                                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-indigo-50"
                                                            >
                                                                {color}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="hidden">Stock</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={variant.stock}
                                                    onChange={e => handleVariantChange(idx, 'stock', e.target.value)}
                                                    placeholder="Stock"
                                                    className="h-8 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                                    required
                                                />
                                            </div>

                                            <div className="hidden">
                                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 xl:hidden">Unidad base</label>
                                                <div className="flex min-h-[42px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700">
                                                    {newProduct.unidad_base || 'Unidad'}
                                                </div>
                                            </div>

                                            <div className="hidden">
                                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 xl:hidden">Unidad de conversion</label>
                                                <div className="flex min-h-[42px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                                                    {Array.isArray(newProduct.unidades_alternativas) && newProduct.unidades_alternativas.length > 0
                                                        ? `${newProduct.unidades_alternativas[0]}${Number(newProduct.factor_conversion) > 0 ? ` · x${newProduct.factor_conversion}` : ''}`
                                                        : 'Sin conversion'}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="hidden">Precio</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={variant.precio}
                                                    onChange={(e) => handleVariantChange(idx, 'precio', e.target.value)}
                                                    placeholder="Precio (opcional)"
                                                    className="h-8 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-indigo-500"
                                                />
                                            </div>

                                            <div className="flex h-8 items-center truncate rounded border border-gray-200 bg-gray-50 px-2 text-xs font-semibold text-gray-700">
                                                {newProduct.unidad_base || 'unidad'}
                                            </div>

                                            <div className="flex h-8 items-center truncate rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700">
                                                {Array.isArray(newProduct.unidades_alternativas) && newProduct.unidades_alternativas.length > 0
                                                    ? `${newProduct.unidades_alternativas[0]} x${newProduct.factor_conversion || 1}`
                                                    : 'Sin conversion'}
                                            </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const variantCode = variant.sku || variant.codigo_barra || '';
                                                            if (variantCode) {
                                                                const event = new CustomEvent('printVariantBarcode', {
                                                                    detail: {
                                                                        codigoBarras: variantCode,
                                                                        nombre: `${newProduct.nombre || 'Producto'} (${variant.color})`,
                                                                        copies: Math.max(1, Math.min(200, Number(variant.stock) || 1)),
                                                                        printMode: 'qz-html',
                                                                        etiquetas: true
                                                                    }
                                                                });
                                                                window.dispatchEvent(event);
                                                            }
                                                        }}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded bg-green-600 text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                        disabled={!(variant.sku || variant.codigo_barra)}
                                                        title="Imprimir etiqueta"
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            viewBox="0 0 24 24"
                                                            className="h-4 w-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M6 9V4h12v5" />
                                                            <rect x="6" y="13" width="12" height="7" rx="1" />
                                                            <path d="M6 14H4a2 2 0 0 1-2-2v-1a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v1a2 2 0 0 1-2 2h-2" />
                                                            <path d="M9 17h6" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeVariantRow(idx)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-400 text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                        disabled={newVariants.length <= 1}
                                                        title="Eliminar variante"
                                                    >
                                                        <svg
                                                            aria-hidden="true"
                                                            viewBox="0 0 24 24"
                                                            className="h-4 w-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M3 6h18" />
                                                            <path d="M8 6V4h8v2" />
                                                            <path d="M19 6l-1 14H6L5 6" />
                                                            <path d="M10 11v6" />
                                                            <path d="M14 11v6" />
                                                        </svg>
                                                    </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <textarea
                        name="descripcion"
                        placeholder="Descripción del Producto"
                        value={newProduct.descripcion}
                        onChange={handleNewProductChange}
                        className="h-16 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 placeholder-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                    />

                    {/* Campo de Subida de Imagen */}
                    <div className="flex flex-col gap-2">
                        <label className="text-gray-700 font-medium mb-2">Imágenes del Producto</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageChange}
                                ref={newImageInputRef}
                                className="hidden"
                                id="new-product-image"
                            />
                            <label
                                htmlFor="new-product-image"
                                className="cursor-pointer rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white shadow-md transition hover:bg-indigo-600"
                            >
                                Seleccionar archivos
                            </label>
                            <span className="text-sm text-gray-500">
                                {imageFiles && imageFiles.length > 0 ? `${imageFiles.length} archivo(s) seleccionado(s)` : 'Ningún archivo seleccionado'}
                            </span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full rounded-lg py-2.5 font-bold text-white transition ${
                            loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg'
                        }`}
                    >
                        {loading ? 'Anadiendo...' : 'Anadir Producto'}
                    </button>
                </form>
            </div>

            {/* 2. Catalogo Actual (Tabla) */}
            <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-3">Catalogo Actual</h2>

            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar por nombre, codigo o categoria"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="p-2 border rounded-lg w-full md:w-80 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Categoria:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="p-2 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">Todas</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={String(cat.id)}>{cat.categori}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>Orden:</span>
                <button
                  className={`px-3 py-1 rounded-lg border ${filterLatest ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-700'}`}
                  type="button"
                  onClick={() => setFilterLatest(true)}
                >
                  Ultimos ingresos
                </button>
                <button
                  className={`px-3 py-1 rounded-lg border ${!filterLatest ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-700'}`}
                  type="button"
                  onClick={() => setFilterLatest(false)}
                >
                  Sin orden
                </button>
              </div>
            </div>

            {loading && productos.length === 0 && <p className="text-center text-gray-600">Cargando catálogo...</p>}

            {filteredProductos.length > 0 ? (
                <div className="overflow-x-auto bg-white rounded-xl shadow-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">ID Producto (user_id)</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Imagen</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Código de Barra</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Nombre</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Categoría</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Precio Compra (Bs)</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Precio Venta (Bs)</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Stock</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Colores</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-900 uppercase tracking-wider bg-white">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-gray-900">
                            {filteredProductos.map((producto) => {
                                const safe = (val) => (typeof val === 'string' || typeof val === 'number') ? val : JSON.stringify(val ?? '');
                                // Unificar lógica: usar imagenesProductos, luego imagen_url, luego placeholder
                                const imagenes = (imagenesProductos[producto.user_id]?.length > 0)
                                    ? imagenesProductos[producto.user_id]
                                    : (producto.imagen_url ? [producto.imagen_url] : ["https://placehold.co/300x200/cccccc/333333?text=Sin+Imagen"]);
                                return (
                                    <tr key={safe(producto.user_id)} className="product-row hover:bg-gray-50 transition duration-150">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{String(safe(producto.user_id)).substring(0, 8) + '...'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="imagenes-grid">
                                                {imagenes.map((img, idx, arr) => {
                                                    if (typeof img !== 'string') return null;
                                                    const rawSrc = safe(img);
                                                    return (
                                                        <img
                                                            key={safe(img)}
                                                            src={getOptimizedImageUrl(rawSrc, 300)}
                                                            srcSet={buildImageSrcSet(rawSrc, [300, 600, 900], { quality: 95, format: 'origin' })}
                                                            sizes="(max-width: 768px) 120px, 300px"
                                                            loading="lazy"
                                                            decoding="async"
                                                            alt={safe(producto.nombre)}
                                                            className="thumbnail cursor-pointer hover:shadow-lg transition"
                                                            onClick={() => openImageModal(arr, idx, producto.nombre)}
                                                            onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/300x200/cccccc/333333?text=Sin+Imagen"; }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="flex flex-col items-center justify-center" style={{ width: '7cm', maxWidth: '140px' }}>
                                                {/* renderizamos una versión compacta para evitar overlap en la tabla */}
                                                <Barcode
                                                    ref={(el) => {
                                                        if (!window._barcodeRefs) window._barcodeRefs = {};
                                                        if (el && producto.codigo_barra) window._barcodeRefs[producto.codigo_barra] = el;
                                                    }}
                                                    value={safe(producto.codigo_barra)}
                                                    width={1.1}
                                                    height={35}
                                                    fontSize={10}
                                                    displayValue={false}
                                                    style={{ maxWidth: '100%', width: '100%', height: 'auto', overflow: 'hidden' }}
                                                />
                                                <div className="text-center text-xs font-semibold mt-1 text-gray-600 truncate" title={safe(producto.codigo_barra)}>{safe(producto.codigo_barra)}</div>
                                                <button
                                                    onClick={() => {
                                                        const variantes = getPrintableVariantes(producto);
                                                        if (variantes.length === 0) {
                                                            setMessage(`El producto "${producto.nombre}" no tiene colores cargados para seleccionar.`);
                                                            return;
                                                        }
                                                        openPrintVariantesModal(producto);
                                                    }}
                                                    className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-base font-semibold"
                                                    title="Imprimir Codigo de Barra"
                                                >
                                                    Imprimir
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">{safe(producto.nombre)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{safe(producto.category_name)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Bs {Number(producto.precio_compra || 0).toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <PrecioConPromocion
                                                producto={producto}
                                                promociones={promociones}
                                                className=""
                                                compact={true}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">{safe(producto.stock)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            <div className="flex flex-wrap gap-1">
                                                {(variantesProductos[producto.user_id] || []).map((v) => (
                                                    <span key={`${producto.user_id}-${v.id}`} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
                                                        {v.color} ({v.stock})
                                                    </span>
                                                ))}
                                                {(!variantesProductos[producto.user_id] || variantesProductos[producto.user_id].length === 0) && (
                                                    <span className="text-xs text-gray-400">Sin variantes</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => openEditModal(producto)}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(producto)}
                                                    className="text-red-600 hover:text-red-900"
                                                    disabled={isDeleting}
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                !loading && <p className="text-center text-gray-600">No hay productos en el catálogo.</p>
            )}

            {/* Modal de Edición (Faltaba en tu código, lo agregué con la lógica base) */}
            {editingProduct && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-2xl my-10" onClick={e => e.stopPropagation()}>
                        <h3 className="text-2xl font-bold mb-6 text-indigo-700 border-b pb-3">Editar Producto: {editingProduct.nombre}</h3>
                        <form onSubmit={handleGuardarEdicion} className="space-y-6">
                            {/* Campos de Edición (Iguales al de Añadir) */}
                            <input type="text" name="nombre" placeholder="Nombre" value={editingProduct.nombre} onChange={handleEditProductChange} required className="w-full p-3 border rounded-lg"/>
                            <textarea name="descripcion" placeholder="Descripción" value={editingProduct.descripcion} onChange={handleEditProductChange} className="w-full p-3 border rounded-lg h-20"/>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" name="precio_compra" placeholder="Precio de Compra (Bs)" value={editingProduct.precio_compra} onChange={handleEditProductChange} required step="0.01" className="w-full p-3 border rounded-lg"/>
                                <input type="number" name="precio" placeholder="Precio de Venta (Bs)" value={editingProduct.precio} onChange={handleEditProductChange} required step="0.01" className="w-full p-3 border rounded-lg"/>
                                <input type="number" name="stock" placeholder="Stock" value={editingProduct.stock} onChange={handleEditProductChange} required className="w-full p-3 border rounded-lg"/>
                                <select
                                    name="vista_producto"
                                    value={editingProduct.vista_producto ?? currentProductView}
                                    onChange={handleEditProductChange}
                                    className="w-full p-3 border rounded-lg bg-white"
                                >
                                    <option value="articulos">Vista: Articulos</option>
                                    <option value="insumos">Vista: Insumos</option>
                                </select>
                                <select
                                    name="category_id"
                                    value={editingProduct.category_id ?? ''}
                                    onChange={handleEditProductChange}
                                    className="w-full p-3 border rounded-lg bg-white"
                                >
                                    <option value="">-- Seleccionar Categoría --</option>
                                    {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.categori}</option>))}
                                </select>
                                <input
                                    type="text"
                                    name="codigo_barra"
                                    placeholder="Código de Barra"
                                    value={editingProduct.codigo_barra}
                                    onChange={handleEditProductChange}
                                    className="w-full p-3 border rounded-lg"
                                    maxLength={13}
                                />
                            </div>

                            {/* Imágenes Actuales (con opción a eliminar) */}
                            <div className="border p-3 rounded-lg">
                                <label className="block text-gray-700 font-medium mb-2">Imágenes Actuales (Click para eliminar)</label>
                                <div className="flex flex-wrap gap-2">
                                    {editImageList.map((url) => (
                                        <div key={url} className="relative group">
                                            <Image
                                                src={getOptimizedImageUrl(url, 300)}
                                                srcSet={buildImageSrcSet(url, [200, 300, 600], { quality: 95, format: 'origin' })}
                                                sizes="64px"
                                                alt="Imagen de producto"
                                                width={64}
                                                height={64}
                                                className="h-16 w-16 object-cover rounded-md border cursor-pointer"
                                                onClick={() => handleRemoveEditImage(url)}
                                            />
                                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-300 rounded-md cursor-pointer" onClick={() => handleRemoveEditImage(url)}>
                                                <span className="text-white font-bold text-xl">&times;</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Añadir Nuevas Imágenes */}
                            <div className="flex flex-col">
                                <label className="text-gray-700 font-medium mb-2">Añadir más Imágenes</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleEditImageChange}
                                    className="w-full p-3 border border-gray-300 rounded-lg bg-white"
                                />
                                {editImageFiles.length > 0 && <span className="text-sm text-gray-500 mt-1">{editImageFiles.length} nuevo(s) archivo(s) listo(s) para subir.</span>}
                            </div>

                            <div className="flex justify-end space-x-4 pt-4">
                                <button type="button" onClick={closeEditModal} className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition">Cancelar</button>
                                <button type="submit" disabled={loading} className={`px-4 py-2 font-bold text-white rounded-lg transition ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Selección de Colores para Imprimir */}
            <PrintVariantesModal
                isOpen={isPrintModalOpen}
                onClose={() => {
                    setIsPrintModalOpen(false);
                    setProductToPrint(null);
                    setSelectedColorsToPrint({});
                }}
                product={productToPrint}
                variantes={productToPrint ? getPrintableVariantes(productToPrint) : []}
                onPrint={handlePrintMultipleVariantes}
                selectedColors={selectedColorsToPrint}
                onColorToggle={handleColorToggle}
                onToggleAll={handleToggleAllColors}
                qzHealth={qzHealth}
                onCheckQz={checkQzHealth}
                showQzStatus={ENABLE_QZ_PRODUCT_LABEL_FLOW}
                cutMode={ENABLE_QZ_RAW_LABEL_PRINT
                    ? 'raw-per-copy'
                    : (ENABLE_QZ_HTML_LABEL_PRINT
                        ? 'qz-html-per-label'
                        : (ENABLE_QZ_CUT_PER_LABEL_WITH_BROWSER_PRINT
                        ? 'browser-per-label'
                        : (ENABLE_QZ_CUT_ONLY_AFTER_BROWSER_PRINT ? 'browser-final' : 'off')))}
            />

            {/* Modal de Confirmación de Eliminación */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                productName={productToDelete?.nombre}
            />

            {/* Modal de Vista Previa de Imagen */}
            <ImagePreviewModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                imageList={selectedImageList}
                imageIndex={selectedImageIndex}
                productName={selectedImageName}
                onPrev={prevImage}
                onNext={nextImage}
            />
        </div> // Cierre del div principal
    ); // Cierre del return
} // Cierre de la función AdminProductosPage
