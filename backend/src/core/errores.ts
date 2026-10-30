export class ErrorNegocio extends Error {
  constructor(mensaje: string, public estado = 400) {
    super(mensaje);
  }
}