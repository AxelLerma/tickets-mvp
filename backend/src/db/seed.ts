import bcrypt from "bcryptjs";
import { cerrarConexion, ejecutar, iniciarEsquema, insertar, transaccion, uno } from "./connection";

const PASSWORD_DEMO = "Demo1234!";

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
    for (const nombre of categorias) {
      await insertar("INSERT INTO categorias (nombre) VALUES (?)", [nombre]);
    }

    const clave = bcrypt.hashSync(PASSWORD_DEMO, 10);
    const usuarios: [string, string, string, string, number | null][] = [
      ["Laura Méndez", "reportante@demo.mx", "5511111111", "reportante", null],
      ["Carlos Ruiz", "tecnico.norte@demo.mx", "8122222222", "tecnico", norte],
      ["Marco Díaz", "tecnico.norte2@demo.mx", "8133333333", "tecnico", norte],
      ["Ana Torres", "tecnico.sur@demo.mx", "5533333333", "tecnico", sur],
      ["Jorge Salas", "manager@demo.mx", "5544444444", "manager", null],
      ["Administrador", "admin@demo.mx", "5555555555", "admin", null],
    ];
    for (const [nombre, correo, telefono, rol, regionId] of usuarios) {
      await ejecutar(
        "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id) VALUES (?, ?, ?, ?, ?, ?)",
        [nombre, correo, telefono, clave, rol, regionId],
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