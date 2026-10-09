import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  wake() {
    return {
      status: 'awake',
      time: Date.now(),
    };
  }
}
