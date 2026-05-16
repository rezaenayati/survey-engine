import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadFileDto {
    /** Optional survey ID used to enforce question-level file rules. */
    @IsOptional()
    @IsUUID()
    surveyId?: string;

    /** Optional question ID used with surveyId for file type/size validation. */
    @IsOptional()
    @IsString()
    questionId?: string;
}
