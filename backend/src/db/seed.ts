import bcrypt from "bcryptjs";
import { db, iniciarEsquema } from "./connection";

const PASSWORD_DEMO = "Demo1234!";

iniciarEsquema();

const existe = db.prepare("SELECT 1 FROM usuarios LIMIT 1").get();
if (existe) {
  console.log("La base ya tiene datos; no se hizo nada.");
  process.exit(0);
}

const sembrar = db.transaction(() => {
  const insertarRegion = db.prepare("INSERT INTO regiones (nombre) VALUES (?)");
  const norte = Number(insertarRegion.run("Norte").lastInsertRowid);
  const sur = Number(insertarRegion.run("Sur").lastInsertRowid);

  const insertarSede = db.prepare("INSERT INTO sedes (nombre, region_id) VALUES (?, ?)");
  insertarSede.run("Planta Monterrey", norte);
  insertarSede.run("Almacén Saltillo", norte);
  insertarSede.run("Oficinas CDMX", sur);
  insertarSede.run("Planta Puebla", sur);

  const insertarCategoria = db.prepare("INSERT INTO categorias (nombre) VALUES (?)");
  [
    "Red e internet",
    "Equipo de cómputo",
    "Impresoras",
    "Telefonía",
    "Software y accesos",
    "Mobiliario",
    "Instalaciones eléctricas",
    "Otro",
  ].forEach((nombre) => insertarCategoria.run(nombre));

  const clave = bcrypt.hashSync(PASSWORD_DEMO, 10);
  const insertarUsuario = db.prepare(
    "INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol, region_id) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insertarUsuario.run("Laura Méndez", "reportante@demo.mx", "5511111111", clave, "reportante", null);
  insertarUsuario.run("Carlos Ruiz", "tecnico.norte@demo.mx", "8122222222", clave, "tecnico", norte);
  insertarUsuario.run("Ana Torres", "tecnico.sur@demo.mx", "5533333333", clave, "tecnico", sur);
  insertarUsuario.run("Jorge Salas", "manager@demo.mx", "5544444444", clave, "manager", null);
  insertarUsuario.run("Administrador", "admin@demo.mx", "5555555555", clave, "admin", null);
});

sembrar();
console.log(`Listo. Usuarios demo con contraseña: ${PASSWORD_DEMO}`);