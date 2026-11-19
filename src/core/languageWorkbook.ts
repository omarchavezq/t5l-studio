import { tableFromCells } from './multilanguage';

export async function readLanguageWorkbook(data: Uint8Array) {
  if (data.length > 16 * 1024 * 1024) throw new Error('La tabla supera el límite de 16 MB.');
  const XLSX = await import('xlsx');
  const book = XLSX.read(data, { type: 'array', sheetRows: 4098, cellFormula: false, bookVBA: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('El libro no contiene una hoja de textos.');
  const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  if (range.e.c > 32 || range.e.r > 4096) throw new Error('La hoja supera 4096 textos más cabecera o 32 idiomas. Recorte su área de datos.');
  return tableFromCells(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false }));
}
