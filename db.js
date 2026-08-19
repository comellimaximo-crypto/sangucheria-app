// Capa de datos muy simple, basada en un archivo JSON.
// No requiere instalar ninguna base de datos: todo se guarda en data.json
// en la misma carpeta del proyecto. Alcanza de sobra para una sola
// sangucheria manejada por una persona, y se puede migrar a una base
// de datos real (Postgres/Supabase, etc.) el dia que haga falta.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function datosPorDefecto() {
  const mesas = [];
  for (let i = 1; i <= 8; i++) {
    mesas.push({ id: i, numero: i, estado: 'libre', pedidoId: null });
  }
  return {
    productos: [],
      mesas,
    pedidos: [],
      nextIds: { producto: 1, mesa: mesas.length + 1, pedido: 1 }
  };
}

let data;

function cargar() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return;
    } catch (err) {
      console.error('No se pudo leer data.json, se crea uno nuevo.', err);
    }
  }
  data = datosPorDefecto();
  guardar();
}

function guardar() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function siguienteId(tipo) {
  const id = data.nextIds[tipo];
  data.nextIds[tipo] = id + 1;
  return id;
}

cargar();

module.exports = {
  get data() {
    return data;
  },
    guardar,
  siguienteId
};
