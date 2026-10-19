import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { PushModule } from 'src/push/push.module';

@Module({
  imports: [SupabaseModule, PushModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
