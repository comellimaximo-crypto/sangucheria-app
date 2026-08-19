const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------

function calcularTotal(pedido) {
return pedido.items.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);
}

function pedidoPublico(pedido) {
return { ...pedido, total: calcularTotal(pedido) };
}

function buscarProducto(id) {
return db.data.productos.find((p) => p.id === Number(id));
}
function buscarMesa(id) {
return db.data.mesas.find((m) => m.id === Number(id));
}
function buscarPedido(id) {
return db.data.pedidos.find((p) => p.id === Number(id));
}

// ---------- Productos ----------

app.get('/api/productos', (req, res) => {
res.json(db.data.productos);
});

app.post('/api/productos', (req, res) => {
const { nombre, categoria, costo, precio, stock, stockMinimo } = req.body;
if (!nombre || costo == null || precio == null) {
return res.status(400).json({ error: 'Faltan datos: nombre, costo y precio son obligatorios.' });
}
const producto = {
id: db.siguienteId('producto'),
nombre: String(nombre).trim(),
categoria: categoria ? String(categoria).trim() : '',
costo: Number(costo),
precio: Number(precio),
stock: stock != null ? Number(stock) : 0,
stockMinimo: stockMinimo != null ? Number(stockMinimo) : 0
};
db.data.productos.push(producto);
db.guardar();
res.status(201).json(producto);
});

app.put('/api/productos/:id', (req, res) => {
const producto = buscarProducto(req.params.id);
if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
const { nombre, categoria, costo, precio, stock, stockMinimo } = req.body;
if (nombre != null) producto.nombre = String(nombre).trim();
if (categoria != null) producto.categoria = String(categoria).trim();
if (costo != null) producto.costo = Number(costo);
if (precio != null) producto.precio = Number(precio);
if (stock != null) producto.stock = Number(stock);
if (stockMinimo != null) producto.stockMinimo = Number(stockMinimo);
db.guardar();
res.json(producto);
});

app.delete('/api/productos/:id', (req, res) => {
const idx = db.data.productos.findIndex((p) => p.id === Number(req.params.id));
if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });
db.data.productos.splice(idx, 1);
db.guardar();
res.status(204).end();
});

// Ajuste manual de stock (reponer mercaderia, correcciones, etc.)
app.post('/api/productos/:id/ajustar-stock', (req, res) => {
const producto = buscarProducto(req.params.id);
if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
const { delta } = req.body;
if (delta == null || isNaN(Number(delta))) {
return res.status(400).json({ error: 'Falta "delta" numerico (positivo para sumar, negativo para restar).' });
}
producto.stock = producto.stock + Number(delta);
db.guardar();
res.json(producto);
});

// ---------- Mesas ----------

app.get('/api/mesas', (req, res) => {
res.json(db.data.mesas);
});

app.post('/api/mesas', (req, res) => {
const numero = req.body.numero != null ? Number(req.body.numero) : db.data.mesas.length + 1;
const mesa = { id: db.siguienteId('mesa'), numero, estado: 'libre', pedidoId: null };
db.data.mesas.push(mesa);
db.guardar();
res.status(201).json(mesa);
});

app.delete('/api/mesas/:id', (req, res) => {
const mesa = buscarMesa(req.params.id);
if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
if (mesa.estado === 'ocupada') {
return res.status(400).json({ error: 'No se puede borrar una mesa ocupada.' });
}
db.data.mesas = db.data.mesas.filter((m) => m.id !== mesa.id);
db.guardar();
res.status(204).end();
});

// ---------- Pedidos ----------

app.get('/api/pedidos', (req, res) => {
let pedidos = db.data.pedidos;
if (req.query.estado) {
pedidos = pedidos.filter((p) => p.estado === req.query.estado);
}
res.json(pedidos.map(pedidoPublico));
});

app.get('/api/pedidos/:id', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
res.json(pedidoPublico(pedido));
});

// Crear un pedido nuevo: para una mesa, o para llevar
app.post('/api/pedidos', (req, res) => {
const { mesaId } = req.body;
let mesa = null;
if (mesaId != null) {
mesa = buscarMesa(mesaId);
if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
if (mesa.estado === 'ocupada') {
return res.status(400).json({ error: 'La mesa ya esta ocupada.' });
}
}
const pedido = {
id: db.siguienteId('pedido'),
mesaId: mesa ? mesa.id : null,
tipo: mesa ? 'mesa' : 'llevar',
estado: 'abierto',
items: [],
creado: new Date().toISOString(),
cerrado: null
};
db.data.pedidos.push(pedido);
if (mesa) {
mesa.estado = 'ocupada';
mesa.pedidoId = pedido.id;
}
db.guardar();
res.status(201).json(pedidoPublico(pedido));
});

// Agregar un item al pedido
app.post('/api/pedidos/:id/items', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.estado !== 'abierto') {
return res.status(400).json({ error: 'El pedido ya esta cerrado.' });
}
const { productoId, cantidad } = req.body;
const producto = buscarProducto(productoId);
if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
const cant = Number(cantidad) > 0 ? Number(cantidad) : 1;
if (cant > producto.stock) {
return res.status(409).json({ error: `Stock insuficiente de "${producto.nombre}". Disponible: ${producto.stock}.` });
}
const existente = pedido.items.find((it) => it.productoId === producto.id);
if (existente) {
existente.cantidad += cant;
} else {
pedido.items.push({
productoId: producto.id,
nombre: producto.nombre,
cantidad: cant,
precioUnitario: producto.precio,
costoUnitario: producto.costo
});
}
db.guardar();
res.status(201).json(pedidoPublico(pedido));
});

// Cambiar cantidad de un item (por indice dentro del pedido)
app.put('/api/pedidos/:id/items/:idx', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.estado !== 'abierto') return res.status(400).json({ error: 'El pedido ya esta cerrado.' });
const idx = Number(req.params.idx);
const item = pedido.items[idx];
if (!item) return res.status(404).json({ error: 'Item no encontrado' });
const cantidad = Number(req.body.cantidad);
if (!cantidad || cantidad <= 0) {
pedido.items.splice(idx, 1);
} else {
item.cantidad = cantidad;
}
db.guardar();
res.json(pedidoPublico(pedido));
});

app.delete('/api/pedidos/:id/items/:idx', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.estado !== 'abierto') return res.status(400).json({ error: 'El pedido ya esta cerrado.' });
const idx = Number(req.params.idx);
if (!pedido.items[idx]) return res.status(404).json({ error: 'Item no encontrado' });
pedido.items.splice(idx, 1);
db.guardar();
res.json(pedidoPublico(pedido));
});

// Cerrar y cobrar un pedido: descuenta stock y libera la mesa
app.post('/api/pedidos/:id/cerrar', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.estado !== 'abierto') {
return res.status(400).json({ error: 'El pedido ya esta cerrado.' });
}
if (pedido.items.length === 0) {
return res.status(400).json({ error: 'El pedido no tiene items.' });
}
for (const item of pedido.items) {
const producto = buscarProducto(item.productoId);
if (producto) producto.stock = Math.max(0, producto.stock - item.cantidad);
}
pedido.estado = 'pagado';
pedido.cerrado = new Date().toISOString();
if (pedido.mesaId != null) {
const mesa = buscarMesa(pedido.mesaId);
if (mesa) {
mesa.estado = 'libre';
mesa.pedidoId = null;
}
}
db.guardar();
res.json(pedidoPublico(pedido));
});

// Cancelar un pedido sin cobrarlo (no descuenta stock)
app.post('/api/pedidos/:id/cancelar', (req, res) => {
const pedido = buscarPedido(req.params.id);
if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
if (pedido.estado !== 'abierto') {
return res.status(400).json({ error: 'El pedido ya esta cerrado.' });
}
pedido.estado = 'cancelado';
pedido.cerrado = new Date().toISOString();
if (pedido.mesaId != null) {
const mesa = buscarMesa(pedido.mesaId);
if (mesa) {
mesa.estado = 'libre';
mesa.pedidoId = null;
}
}
db.guardar();
res.json(pedidoPublico(pedido));
});

// ---------- Reporte simple del dia ----------

app.get('/api/resumen', (req, res) => {
const hoy = new Date().toISOString().slice(0, 10);
const pedidosHoy = db.data.pedidos.filter((p) => p.estado === 'pagado' && p.cerrado && p.cerrado.slice(0, 10) === hoy);
let ventas = 0;
let costos = 0;
for (const p of pedidosHoy) {
for (const it of p.items) {
ventas += it.cantidad * it.precioUnitario;
costos += it.cantidad * it.costoUnitario;
}
}
res.json({
fecha: hoy,
pedidosCerrados: pedidosHoy.length,
ventas,
costos,
ganancia: ventas - costos,
productosStockBajo: db.data.productos.filter((p) => p.stock <= p.stockMinimo)
});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`Sangucheria app corriendo en el puerto ${PORT}`);
});
