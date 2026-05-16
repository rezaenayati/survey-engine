import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiSecurity,
    ApiTags,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { UploadFileDto } from './dto/upload-file.dto';
import { FileResponseDto } from './dto/file-response.dto';
import { GetContext } from '../common/decorators/request-context.decorator';
import type { RequestContext } from '../common/interfaces/request-context.interface';

@ApiTags('files')
@ApiSecurity('user-id')
@Controller('files')
export class FilesController {
    constructor(private readonly filesService: FilesService) {}

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({
        summary: 'Upload a file for a file question',
        description:
            'Returns file metadata that can be stored in a file question answer as `{ fileId, originalName, mimeType, size, url }`.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
                surveyId: {
                    type: 'string',
                    format: 'uuid',
                    description:
                        'Optional. When provided with questionId, enforces question-level file rules.',
                },
                questionId: {
                    type: 'string',
                    description:
                        'Optional. When provided with surveyId, enforces question-level file rules.',
                },
            },
            required: ['file'],
        },
    })
    @ApiResponse({
        status: 201,
        description: 'Uploaded file metadata',
        type: FileResponseDto,
    })
    async upload(
        @GetContext() ctx: RequestContext,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() dto: UploadFileDto,
    ): Promise<Record<string, unknown>> {
        const uploaded = await this.filesService.upload(ctx, file, dto);
        return this.filesService.toResponse(uploaded);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Download an uploaded file' })
    @ApiParam({ name: 'id', description: 'File ID' })
    @ApiResponse({ status: 200, description: 'File stream' })
    async download(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<StreamableFile> {
        const result = await this.filesService.open(ctx, id);

        return new StreamableFile(result.stream, {
            type: result.contentType,
            disposition: `attachment; filename="${this.headerSafeFilename(
                result.file.originalName,
            )}"`,
            length: result.contentLength,
        });
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @Header('Content-Length', '0')
    @ApiOperation({ summary: 'Delete an uploaded file' })
    @ApiParam({ name: 'id', description: 'File ID' })
    @ApiResponse({ status: 204, description: 'File deleted' })
    async remove(
        @GetContext() ctx: RequestContext,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        await this.filesService.remove(ctx, id);
    }

    private headerSafeFilename(filename: string): string {
        return filename.replace(/["\\\r\n]/g, '_');
    }
}
