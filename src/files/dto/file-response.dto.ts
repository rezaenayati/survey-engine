import { ApiProperty } from '@nestjs/swagger';
import { FileStorageProvider } from '../entities/uploaded-file.entity';

export class FileResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    originalName: string;

    @ApiProperty()
    mimeType: string;

    @ApiProperty()
    size: number;

    @ApiProperty({ enum: FileStorageProvider })
    storageProvider: FileStorageProvider;

    @ApiProperty({ nullable: true })
    url: string | null;

    @ApiProperty()
    createdAt: Date;
}
