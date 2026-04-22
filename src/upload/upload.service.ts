import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type CellValue, Workbook } from 'exceljs';
import { ClientsService, type BulkRejectedRow } from '@/clients/clients.service';

interface ParsedClient {
  name: string;
  phone: string;
  cedula: string | null;
  ssNumber: string | null;
  salary: number | null;
  extraData: Record<string, unknown>;
}

export interface UploadImportResult {
  uploadBatchId: string;
  insertedCount: number;
  rejectedCount: number;
  rejected: BulkRejectedRow[];
}

/** Header alias map: lower-cased Excel column header -> canonical field name. */
const HEADER_ALIASES: Record<string, keyof ParsedClient> = {
  name: 'name',
  nombre: 'name',
  phone: 'phone',
  telefono: 'phone',
  teléfono: 'phone',
  celular: 'phone',
  cedula: 'cedula',
  cédula: 'cedula',
  ss: 'ssNumber',
  's.s': 'ssNumber',
  'seguro social': 'ssNumber',
  ssnumber: 'ssNumber',
  salary: 'salary',
  salario: 'salary',
};

function cellToString(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return value.text;
  if (typeof value === 'object' && 'result' in value)
    return cellToString(value.result as CellValue);
  return '';
}

function parseSalary(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

@Injectable()
export class UploadService {
  constructor(private readonly clientsService: ClientsService) {}

  async parseExcel(buffer: Buffer): Promise<ParsedClient[]> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel file contains no worksheets');
    }

    const headerRow = worksheet.getRow(1);
    /**
     * colIndex -> { canonical field, raw header }. Element may be `undefined`
     * because we assign by `colNumber`, leaving sparse holes in the array.
     */
    interface HeaderMeta {
      canonical: keyof ParsedClient | undefined;
      raw: string;
    }
    const colMap: (HeaderMeta | undefined)[] = [];

    headerRow.eachCell((cell, colNumber) => {
      const raw = cellToString(cell.value).toLowerCase().trim();
      colMap[colNumber] = { canonical: HEADER_ALIASES[raw], raw };
    });

    const hasName = colMap.some((c) => c?.canonical === 'name');
    const hasPhone = colMap.some((c) => c?.canonical === 'phone');
    if (!hasName) {
      throw new BadRequestException('Excel file must contain a "name" or "nombre" column');
    }
    if (!hasPhone) {
      throw new BadRequestException(
        'Excel file must contain a "phone", "telefono" or "celular" column',
      );
    }

    const clients: ParsedClient[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      let name = '';
      let phone = '';
      let cedula: string | null = null;
      let ssNumber: string | null = null;
      let salary: number | null = null;
      const extraData: Record<string, unknown> = {};

      for (const [colIndex, meta] of colMap.entries()) {
        if (meta === undefined || meta.raw === '') continue;
        const value = row.getCell(colIndex).value;
        if (value == null) continue;
        const str = cellToString(value).trim();
        if (str === '') continue;

        switch (meta.canonical) {
          case 'name':
            name = str;
            break;
          case 'phone':
            phone = str;
            break;
          case 'cedula':
            cedula = str;
            break;
          case 'ssNumber':
            ssNumber = str;
            break;
          case 'salary':
            salary = parseSalary(str);
            break;
          default:
            extraData[meta.raw] = typeof value === 'object' ? str : value;
        }
      }

      if (name === '' || phone === '') return;
      clients.push({ name, phone, cedula, ssNumber, salary, extraData });
    });

    if (clients.length === 0) {
      throw new BadRequestException('Excel file contains no valid client rows');
    }

    return clients;
  }

  async importClients(file: Express.Multer.File): Promise<UploadImportResult> {
    const uploadBatchId = randomUUID();
    const parsedClients = await this.parseExcel(file.buffer);
    const { inserted, rejected } = await this.clientsService.bulkCreate(
      parsedClients,
      uploadBatchId,
    );

    return {
      uploadBatchId,
      insertedCount: inserted.length,
      rejectedCount: rejected.length,
      rejected,
    };
  }
}
