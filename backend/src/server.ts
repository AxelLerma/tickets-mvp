import { app } from "./app";
import { config } from "./config";
import { iniciarEsquema } from "./db/connection";
import { iniciarCorreo } from "./services/correo.service";

async function iniciar(): Promise<void> {
  await iniciarEsquema();
  iniciarCorreo();
  app.listen(config.port, () => {
    console.log(`API lista en http://localhost:${config.port}`);
  });
}

iniciar().catch((error) => {
  console.error("No fue posible iniciar el servidor:", error.message);
  process.exit(1);
});