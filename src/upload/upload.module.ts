import { forwardRef, Module } from '@nestjs/common';
import { ClientsModule } from '@/clients/clients.module';
import { UploadService } from './upload.service';

@Module({
  imports: [forwardRef(() => ClientsModule)],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
