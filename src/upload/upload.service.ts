import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type CellValue, Workbook } from 'exceljs';
import { ClientsService } from '@/clients/clients.service';
import { type ClientDocument } from '@/clients/schemas/client.schema';

interface ParsedClient {
  name: string;
  phone: string;
  extraData: Record<string, unknown>;
}

interface ImportResult {
  uploadBatchId: string;
  count: number;
  clients: ClientDocument[];
}

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
    const headers: string[] = [];

    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cellToString(cell.value).toLowerCase().trim();
    });

    const nameCol = headers.findIndex((h) => h === 'name' || h === 'nombre');
    const phoneCol = headers.findIndex(
      (h) => h === 'phone' || h === 'telefono' || h === 'teléfono',
    );

    if (nameCol === -1) {
      throw new BadRequestException('Excel file must contain a "name" or "nombre" column');
    }
    if (phoneCol === -1) {
      throw new BadRequestException('Excel file must contain a "phone" or "telefono" column');
    }

    const clients: ParsedClient[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const name = cellToString(row.getCell(nameCol).value).trim();
      const phone = cellToString(row.getCell(phoneCol).value).trim();

      if (name === '' || phone === '') return;

      const extraData: Record<string, unknown> = {};
      for (const [colIndex, header] of headers.entries()) {
        if (colIndex === 0 || colIndex === nameCol || colIndex === phoneCol || header === '')
          continue;
        const cellValue = row.getCell(colIndex).value;
        if (cellValue != null) {
          extraData[header] = typeof cellValue === 'object' ? cellToString(cellValue) : cellValue;
        }
      }

      clients.push({ name, phone, extraData });
    });

    if (clients.length === 0) {
      throw new BadRequestException('Excel file contains no valid client rows');
    }

    return clients;
  }

  async importClients(file: Express.Multer.File): Promise<ImportResult> {
    const uploadBatchId = randomUUID();
    const parsedClients = await this.parseExcel(file.buffer);
    const clients = await this.clientsService.bulkCreate(parsedClients, uploadBatchId);

    return {
      uploadBatchId,
      count: clients.length,
      clients,
    };
  }
}
