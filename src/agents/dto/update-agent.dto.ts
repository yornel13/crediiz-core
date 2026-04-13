import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string | undefined;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string | undefined;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean | undefined;
}
