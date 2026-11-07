import PDFDocument from "pdfkit";
import type { Reporte } from "./reporte.service";

const PELIGROSO = /^[=+\-@\t\r]/;

function celdaCsv(valor: string | number): string {
  if (typeof valor === "number") return String(valor);
  const seguro = PELIGROSO.test(valor) ? `'${valor}` : valor;
  return /[",\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function aCsv(reporte: Reporte): Buffer {
  const lineas = [
    reporte.columnas.map((c) => celdaCsv(c.titulo)).join(","),
    ...reporte.filas.map((fila) => reporte.columnas.map((c) => celdaCsv(fila[c.clave] ?? "")).join(",")),
  ];
  return Buffer.from(`\uFEFF${lineas.join("\r\n")}\r\n`, "utf8");
}

const MORADO = "#4b2377";
const INSTITUCIONAL_OSCURO = "#0a454b";
const BLANCO = "#ffffff";
const TEXTO_NEGRO = "#0f172a";
const FILA_PAR = "#f3f0f8";
const BORDE_FILA = "#cbd5e1";
const MARGEN = 36;

export function aPdf(reporte: Reporte, filtros: string): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGEN, bufferPages: true });
    const partes: Buffer[] = [];
    doc.on("data", (p: Buffer) => partes.push(p));
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rechazar);

    const ancho = doc.page.width - MARGEN * 2;
    const suma = reporte.columnas.reduce((s, c) => s + c.ancho, 0);
    const anchos = reporte.columnas.map((c) => (c.ancho / suma) * ancho);
    const generado = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date());

    const encabezadoPagina = () => {
      doc.fillColor(INSTITUCIONAL_OSCURO).font("Helvetica-Bold").fontSize(9).text("Instituto Electoral del Estado de Querétaro", MARGEN, MARGEN - 6);
      doc.fillColor("#000").fontSize(15).text(reporte.titulo, MARGEN, doc.y + 2);
      doc.font("Helvetica").fontSize(8).fillColor("#444").text(`${filtros} · Generado: ${generado}`, MARGEN, doc.y + 2, { width: ancho });
      if (reporte.resumen) doc.font("Helvetica-Bold").text(reporte.resumen, MARGEN, doc.y + 2, { width: ancho });
      return doc.y + 8;
    };

    const encabezadoTabla = (y: number) => {
      doc.rect(MARGEN, y, ancho, 22).fill(INSTITUCIONAL_OSCURO);
      doc.moveTo(MARGEN, y + 22).lineTo(MARGEN + ancho, y + 22).stroke();
      let x = MARGEN;
      doc.fillColor(BLANCO).font("Helvetica-Bold").fontSize(9);
      reporte.columnas.forEach((c, i) => {
        doc.text(c.titulo, x + 4, y + 7, { width: anchos[i] - 8, height: 14, align: "left" });
        x += anchos[i];
      });
      return y + 22;
    };

    let y = encabezadoTabla(encabezadoPagina());
    doc.font("Helvetica").fontSize(8.5);

    if (reporte.filas.length === 0) {
      doc.fillColor(TEXTO_NEGRO).text("No hay registros con los filtros seleccionados.", MARGEN + 4, y + 8);
    }

    reporte.filas.forEach((fila, indice) => {
      let altoFila = 22;
      reporte.columnas.forEach((c, i) => {
        const textoCelda = String(fila[c.clave] ?? "");
        const altoTexto = doc.heightOfString(textoCelda, { width: anchos[i] - 10 });
        altoFila = Math.max(altoFila, altoTexto + 10);
      });

      if (y + altoFila > doc.page.height - MARGEN - 20) {
        doc.addPage();
        y = encabezadoTabla(encabezadoPagina());
        doc.font("Helvetica").fontSize(8.5);
      }

      if (indice % 2 === 0) doc.rect(MARGEN, y, ancho, altoFila).fill(FILA_PAR);
      else doc.rect(MARGEN, y, ancho, altoFila).fill(BLANCO);

      doc.moveTo(MARGEN, y + altoFila).lineTo(MARGEN + ancho, y + altoFila).strokeColor(BORDE_FILA).stroke();

      let x = MARGEN;
      doc.fillColor(TEXTO_NEGRO).font("Helvetica").fontSize(8.5);
      reporte.columnas.forEach((c, i) => {
        doc.text(String(fila[c.clave] ?? ""), x + 4, y + 5, { width: anchos[i] - 10, height: altoFila - 10, align: "left", lineBreak: true });
        x += anchos[i];
      });
      y += altoFila;
    });

    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.fillColor("#666").font("Helvetica").fontSize(8).text(`Página ${i + 1} de ${rango.count}`, MARGEN, doc.page.height - 26, {
        width: ancho,
        align: "right",
        lineBreak: false,
      });
    }
    doc.end();
  });
}