import { IsEnum } from 'class-validator';
import { ClientStatus } from '@/common/enums';

export class UpdateClientStatusDto {
  @IsEnum(ClientStatus)
  status!: ClientStatus;
}
