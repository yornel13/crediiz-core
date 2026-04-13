import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { UploadService } from './upload.service';
import { ClientsService } from '@/clients/clients.service';

async function createExcelBuffer(
  headers: string[],
  rows: (string | number | null)[][],
): Promise<Buffer> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Clients');
  worksheet.addRow(headers);
  for (const row of rows) {
    worksheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('UploadService', () => {
  let service: UploadService;
  let clientsService: { bulkCreate: jest.Mock };

  beforeEach(async () => {
    clientsService = { bulkCreate: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadService, { provide: ClientsService, useValue: clientsService }],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  describe('parseExcel', () => {
    it('should parse valid Excel with name and phone columns', async () => {
      const buffer = await createExcelBuffer(
        ['Name', 'Phone', 'Company'],
        [
          ['Alice', '+5071234', 'Acme Inc'],
          ['Bob', '+5075678', 'Globex'],
        ],
      );

      const result = await service.parseExcel(buffer);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Alice',
        phone: '+5071234',
        extraData: { company: 'Acme Inc' },
      });
    });

    it('should support Spanish column names (nombre, telefono)', async () => {
      const buffer = await createExcelBuffer(['Nombre', 'Teléfono'], [['María', '+5079999']]);

      const result = await service.parseExcel(buffer);

      expect(result[0]?.name).toBe('María');
    });

    it('should throw if name column is missing', async () => {
      const buffer = await createExcelBuffer(['Phone'], [['+5071234']]);

      await expect(service.parseExcel(buffer)).rejects.toThrow(BadRequestException);
    });

    it('should throw if phone column is missing', async () => {
      const buffer = await createExcelBuffer(['Name'], [['Alice']]);

      await expect(service.parseExcel(buffer)).rejects.toThrow(BadRequestException);
    });

    it('should throw if no valid rows exist', async () => {
      const buffer = await createExcelBuffer(['Name', 'Phone'], [['', '']]);

      await expect(service.parseExcel(buffer)).rejects.toThrow(BadRequestException);
    });

    it('should skip rows with empty name or phone', async () => {
      const buffer = await createExcelBuffer(
        ['Name', 'Phone'],
        [
          ['Alice', '+507111'],
          ['', '+507222'],
          ['Charlie', ''],
          ['Dave', '+507444'],
        ],
      );

      const result = await service.parseExcel(buffer);

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Alice');
      expect(result[1]?.name).toBe('Dave');
    });
  });

  describe('importClients', () => {
    it('should generate uploadBatchId and call bulkCreate', async () => {
      const buffer = await createExcelBuffer(['Name', 'Phone'], [['Alice', '+507111']]);
      clientsService.bulkCreate.mockResolvedValue([{ name: 'Alice' }]);

      const file = { buffer } as Express.Multer.File;
      const result = await service.importClients(file);

      expect(result.uploadBatchId).toBeDefined();
      expect(result.count).toBe(1);
      expect(clientsService.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'Alice' })]),
        expect.any(String),
      );
    });
  });
});
