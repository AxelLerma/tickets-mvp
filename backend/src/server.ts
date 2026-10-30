import { app } from "./app";
import { config } from "./config";
import { iniciarEsquema } from "./db/connection";

iniciarEsquema();

app.listen(config.port, () => {
  console.log(`API lista en http://localhost:${config.port}`);
});