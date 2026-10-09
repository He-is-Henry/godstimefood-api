import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import 'multer';

@Injectable()
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.getOrThrow<string>('SUPABASE_URL');
    const key = this.configService.getOrThrow<string>('SUPABASE_KEY');

    this.bucket = this.configService.getOrThrow<string>('SUPABASE_BUCKET_NAME');

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL or SUPABASE_KEY environment variable is missing.',
      );
    }

    this.supabase = createClient(url, key) as SupabaseClient;
  }

  async uploadFile(file: Express.Multer.File, folder = 'uploads') {
    const all = await this.supabase.storage.from(this.bucket).list();
    console.log('All existing images: ', all);
    if (!file) {
      throw new BadRequestException('No file provided for upload.');
    }

    const fileExt = file.originalname.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.log(error);
      throw new InternalServerErrorException(
        `Storage upload failed ${error.message}`,
      );
    }
    const path = data.path;

    return path;
  }

  getFile(path: string) {
    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);

    return data.publicUrl;
  }

  async deleteFile(path: string) {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([path]);

    if (error) {
      throw new InternalServerErrorException(
        `Storage deletion failed ${error.message}`,
      );
    }
  }
}
