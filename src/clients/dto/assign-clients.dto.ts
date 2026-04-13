import { IsArray, IsMongoId } from 'class-validator';

export class AssignClientsDto {
  @IsMongoId()
  agentId!: string;

  @IsArray()
  @IsMongoId({ each: true })
  clientIds!: string[];
}
