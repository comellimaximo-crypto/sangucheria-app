const API = '/api';

let productos = [];
let mesas = [];
let pedidoActualId = null;

function money(n) {
return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toast(msg, esError = false) {
const el = document.getElementById('toast');
el.textContent = msg;
el.classList.remove('oculto', 'error');
if (esError) el.classList.add('error');
clearTimeout(toast._t);
toast._t = setTimeout(() => el.classList.add('oculto'), 3000);
}

async function api(path, opts) {
const res = await fetch(API + path, {
headers: { 'Content-Type': 'application/json' },
...opts
});
const contentType = res.headers.get('content-type') || '';
const body = contentType.includes('application/json') ? await res.json() : null;
if (!res.ok) {
throw new Error((body && body.error) || 'Error inesperado');
}
return body;
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
btn.addEventListener('click', () => {
document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
btn.classList.add('active');
document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
if (btn.dataset.tab === 'resumen') cargarResumen();
});
});

async function cargarTodo() {
await Promise.all([cargarProductos(), cargarMesas(), cargarLlevar()]);
}

async function cargarProductos() {
productos = await api('/productos');
renderProductos();
renderSelectProductos();
}

async function cargarMesas() {
mesas = await api('/mesas');
renderMesas();
}

async function cargarLlevar() {
const pedidos = await api('/pedidos?estado=abierto');
renderLlevar(pedidos.filter((p) => p.tipo === 'llevar'));
}

async function cargarResumen() {
const r = await api('/resumen');
document.getElementById('resumen-cards').innerHTML = `
<div class="card"><div class="valor">${r.pedidosCerrados}</div><div class="etiqueta">Pedidos cobrados hoy</div></div>
<div class="card"><div class="valor">${money(r.ventas)}</div><div class="etiqueta">Ventas</div></div>
<div class="card"><div class="valor">${money(r.costos)}</div><div class="etiqueta">Costo de lo vendido</div></div>
<div class="card"><div class="valor">${money(r.ganancia)}</div><div class="etiqueta">Ganancia bruta</div></div>
`;
const lista = document.getElementById('lista-stock-bajo');
lista.innerHTML = '';
if (r.productosStockBajo.length === 0) {
lista.innerHTML = '<li style="background:#eef8ee;">Todo el stock esta en niveles normales.</li>';
} else {
r.productosStockBajo.forEach((p) => {
const li = document.createElement('li');
li.textContent = `${p.nombre}: quedan ${p.stock} (minimo ${p.stockMinimo})`;
lista.appendChild(li);
});
}
}

function renderMesas() {
const grid = document.getElementById('grid-mesas');
grid.innerHTML = '';
mesas.sort((a, b) => a.numero - b.numero).forEach((mesa) => {
const card = document.createElement('div');
card.className = 'mesa-card ' + mesa.estado;
card.innerHTML = `<div class="numero">Mesa ${mesa.numero}</div><div class="estado">${mesa.estado}</div>`;
card.addEventListener('click', () => abrirMesa(mesa));
grid.appendChild(card);
});
}

async function abrirMesa(mesa) {
if (mesa.estado === 'libre') {
try {
const pedido = await api('/pedidos', { method: 'POST', body: JSON.stringify({ mesaId: mesa.id }) });
await cargarMesas();
abrirModalPedido(pedido, `Mesa ${mesa.numero}`);
} catch (e) {
toast(e.message, true);
}
} else {
const pedido = await api('/pedidos/' + mesa.pedidoId);
abrirModalPedido(pedido, `Mesa ${mesa.numero}`);
}
}

document.getElementById('btn-agregar-mesa').addEventListener('click', async () => {
await api('/mesas', { method: 'POST', body: JSON.stringify({}) });
await cargarMesas();
});

function renderLlevar(pedidos) {
const cont = document.getElementById('lista-llevar');
cont.innerHTML = '';
if (pedidos.length === 0) {
cont.innerHTML = '<p>No hay pedidos para llevar abiertos.</p>';
return;
}
pedidos.forEach((p) => {
const div = document.createElement('div');
div.className = 'pedido-card';
div.innerHTML = `<span>Pedido #${p.id} &middot; ${p.items.length} items</span><strong>${money(p.total)}</strong>`;
div.addEventListener('click', () => abrirModalPedido(p, `Pedido para llevar #${p.id}`));
cont.appendChild(div);
});
}

document.getElementById('btn-nuevo-llevar').addEventListener('click', async () => {
const pedido = await api('/pedidos', { method: 'POST', body: JSON.stringify({}) });
await cargarLlevar();
abrirModalPedido(pedido, `Pedido para llevar #${pedido.id}`);
});

function renderSelectProductos() {
const sel = document.getElementById('select-producto');
sel.innerHTML = productos
.map((p) => `<option value="${p.id}">${p.nombre} (${money(p.precio)}, stock ${p.stock})</option>`)
.join('');
}

async function abrirModalPedido(pedido, titulo) {
pedidoActualId = pedido.id;
document.getElementById('pedido-titulo').textContent = titulo;
renderItemsPedido(pedido);
document.getElementById('modal-pedido').classList.remove('oculto');
}

function renderItemsPedido(pedido) {
const tbody = document.querySelector('#tabla-items-pedido tbody');
tbody.innerHTML = '';
pedido.items.forEach((it, idx) => {
const tr = document.createElement('tr');
tr.innerHTML = `
<td>${it.nombre}</td>
<td>${it.cantidad}</td>
<td>${money(it.precioUnitario)}</td>
<td>${money(it.cantidad * it.precioUnitario)}</td>
<td><button class="icon-btn" data-idx="${idx}">quitar</button></td>
`;
tbody.appendChild(tr);
});
document.getElementById('pedido-total').textContent = money(pedido.total);
tbody.querySelectorAll('button[data-idx]').forEach((btn) => {
btn.addEventListener('click', async () => {
const actualizado = await api(`/pedidos/${pedidoActualId}/items/${btn.dataset.idx}`, { method: 'DELETE' });
renderItemsPedido(actualizado);
});
});
}

document.getElementById('btn-agregar-item').addEventListener('click', async () => {
const productoId = document.getElementById('select-producto').value;
const cantidad = Number(document.getElementById('input-cantidad').value) || 1;
if (!productoId) return toast('Primero carga un producto en la pestana "Productos y Stock".', true);
try {
const pedido = await api(`/pedidos/${pedidoActualId}/items`, {
method: 'POST',
body: JSON.stringify({ productoId, cantidad })
});
renderItemsPedido(pedido);
} catch (e) {
toast(e.message, true);
}
});

document.getElementById('btn-cobrar-pedido').addEventListener('click', async () => {
try {
await api(`/pedidos/${pedidoActualId}/cerrar`, { method: 'POST' });
toast('Pedido cobrado y cerrado.');
cerrarModalPedido();
await cargarTodo();
} catch (e) {
toast(e.message, true);
}
});

document.getElementById('btn-cancelar-pedido').addEventListener('click', async () => {
if (!confirm('Cancelar este pedido? No se descontara stock.')) return;
await api(`/pedidos/${pedidoActualId}/cancelar`, { method: 'POST' });
toast('Pedido cancelado.');
cerrarModalPedido();
await cargarTodo();
});

function cerrarModalPedido() {
document.getElementById('modal-pedido').classList.add('oculto');
pedidoActualId = null;
}
document.getElementById('cerrar-modal-pedido').addEventListener('click', cerrarModalPedido);

function renderProductos() {
const tbody = document.querySelector('#tabla-productos tbody');
tbody.innerHTML = '';
productos.forEach((p) => {
const margen = p.precio - p.costo;
const margenPct = p.precio > 0 ? ((margen / p.precio) * 100).toFixed(0) : 0;
const tr = document.createElement('tr');
if (p.stock <= p.stockMinimo) tr.classList.add('stock-bajo');
tr.innerHTML = `
<td>${p.nombre}</td>
<td>${p.categoria || '-'}</td>
<td>${money(p.costo)}</td>
<td>${money(p.precio)}</td>
<td>${money(margen)} (${margenPct}%)</td>
<td>${p.stock}</td>
<td>${p.stockMinimo}</td>
<td class="fila-acciones">
<button class="icon-btn" data-accion="mas" data-id="${p.id}">+1 stock</button>
<button class="icon-btn" data-accion="menos" data-id="${p.id}">-1 stock</button>
<button class="icon-btn" data-accion="editar" data-id="${p.id}">editar</button>
<button class="icon-btn" data-accion="borrar" data-id="${p.id}">borrar</button>
</td>
`;
tbody.appendChild(tr);
});

tbody.querySelectorAll('button[data-accion]').forEach((btn) => {
btn.addEventListener('click', async () => {
const id = btn.dataset.id;
const accion = btn.dataset.accion;
if (accion === 'mas') {
await api(`/productos/${id}/ajustar-stock`, { method: 'POST', body: JSON.stringify({ delta: 1 }) });
await cargarProductos();
} else if (accion === 'menos') {
await api(`/productos/${id}/ajustar-stock`, { method: 'POST', body: JSON.stringify({ delta: -1 }) });
await cargarProductos();
} else if (accion === 'editar') {
abrirModalProducto(productos.find((p) => p.id == id));
} else if (accion === 'borrar') {
if (confirm('Borrar este producto?')) {
try {
await api(`/productos/${id}`, { method: 'DELETE' });
await cargarProductos();
} catch (e) {
toast(e.message, true);
}
}
}
});
});
}

function abrirModalProducto(producto) {
document.getElementById('producto-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
document.getElementById('producto-id').value = producto ? producto.id : '';
document.getElementById('producto-nombre').value = producto ? producto.nombre : '';
document.getElementById('producto-categoria').value = producto ? producto.categoria : '';
document.getElementById('producto-costo').value = producto ? producto.costo : '';
document.getElementById('producto-precio').value = producto ? producto.precio : '';
document.getElementById('producto-stock').value = producto ? producto.stock : 0;
document.getElementById('producto-stock-minimo').value = producto ? producto.stockMinimo : 0;
document.getElementById('modal-producto').classList.remove('oculto');
}

document.getElementById('btn-nuevo-producto').addEventListener('click', () => abrirModalProducto(null));
document.getElementById('cerrar-modal-producto').addEventListener('click', () => {
document.getElementById('modal-producto').classList.add('oculto');
});

document.getElementById('form-producto').addEventListener('submit', async (e) => {
e.preventDefault();
const id = document.getElementById('producto-id').value;
const payload = {
nombre: document.getElementById('producto-nombre').value,
categoria: document.getElementById('producto-categoria').value,
costo: document.getElementById('producto-costo').value,
precio: document.getElementById('producto-precio').value,
stock: document.getElementById('producto-stock').value,
stockMinimo: document.getElementById('producto-stock-minimo').value
};
try {
if (id) {
await api(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
} else {
await api('/productos', { method: 'POST', body: JSON.stringify(payload) });
}
document.getElementById('modal-producto').classList.add('oculto');
await cargarProductos();
toast('Producto guardado.');
} catch (e2) {
toast(e2.message, true);
}
});

cargarTodo();
