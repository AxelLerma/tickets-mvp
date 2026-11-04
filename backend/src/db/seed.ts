import bcrypt from "bcryptjs";
import { cerrarConexion, ejecutar, iniciarEsquema, insertar, transaccion, uno } from "./connection";

const PASSWORD_DEMO = "Demo1234!";

const SUBCATEGORIAS: Record<string, string[]> = {
  "Red e internet": ["Sin conexión", "Conexión lenta", "Wi-Fi"],
  "Equipo de cómputo": ["No enciende", "Lentitud", "Falla de pantalla"],
  Impresoras: ["Atasco de papel", "Sin tóner", "No imprime"],
  Telefonía: ["Sin tono", "Extensión"],
  "Software y accesos": ["Contraseña o acceso", "Instalación de programa"],
};

async function sembrar(): Promise<void> {
  await iniciarEsquema();

  const existe = await uno("SELECT 1 AS ok FROM usuarios LIMIT 1");
  if (existe) {
    console.log("La base ya tiene datos; no se hizo nada.");
    return;
  }

  await transaccion(async () => {
    const norte = await insertar("INSERT INTO regiones (nombre) VALUES (?)", ["Norte"]);
    const sur = await insertar("INSERT INTO regiones (nombre) VALUES (?)", ["Sur"]);

    const sedes: [string, number][] = [
      ["Planta Monterrey", norte],
      ["Almacén Saltillo", norte],
      ["Oficinas CDMX", sur],
      ["Planta Puebla", sur],
    ];
    for (const [nombre, regionId] of sedes) {
      await insertar("INSERT INTO sedes (nombre, region_id) VALUES (?, ?)", [nombre, regionId]);
    }

    const categorias = [
      "Red e internet",
      "Equipo de cómputo",
      "Impresoras",
      "Telefonía",
      "Software y accesos",
      "Mobiliario",
      "Instalaciones eléctricas",
      "Otro",
    ];
    const idsCategoria = new Map<string, number>();
    for (const nombre of categorias) {
      idsCategoria.set(nombre, await insertar("INSERT INTO categorias (nombre) VALUES (?)", [nombre]));
    }

    for (const [categoria, nombres] of Object.entries(SUBCATEGORIAS)) {
      const categoriaId = idsCategoria.get(categoria);
      if (!categoriaId) continue;
      for (const nombre of nombres) {
        await insertar("INSERT INTO subcategorias (categoria_id, nombre) VALUES (?, ?)", [categoriaId, nombre]);
      }
    }

    const grupoNorte = await insertar("INSERT INTO grupos_tecnicos (nombre) VALUES (?)", ["Soporte Norte"]);
    const grupoSur = await insertar("INSERT INTO grupos_tecnicos (nombre) VALUES (?)", ["Soporte Sur"]);

    const clave = bcrypt.hashSync(PASSWORD_DEMO, 10);
    const usuarios: [string, string, string, string, number | null, number | null][] = [
      ["Laura Méndez", "reportante@demo.mx", "5511111111", "reportante", null, null],
      ["Carlos Ruiz", "tecnico.norte@demo.mx", "8122222222", "tecnico", norte, grupoNorte],
      ["Marco Díaz", "tecnico.norte2@demo.mx", "8133333333", "tecnico", norte, grupoNorte],
      ["Ana Torres", "tecnico.sur@demo.mx", "5533333333", "tecnico", sur, grupoSur],
      ["Jorge Salas", "manager@demo.mx", "5544444444", "manager", null, null],
      ["Administrador", "admin@demo.mx", "5555555555", "admin", null, null],
    ];
    for (const [nombre, correo, telefono, rol, regionId, grupoId] of usuarios) {
      await ejecutar(
        "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id, grupo_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [nombre, correo, telefono, clave, rol, regionId, grupoId],
      );
    }
  });

  console.log(`Listo. Usuarios demo con contraseña: ${PASSWORD_DEMO}`);
}

sembrar()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => cerrarConexion());