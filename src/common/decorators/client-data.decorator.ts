import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { UAParser } from 'ua-parser-js';

export interface ISClientData {
  deviceInfo: string;
  ipAddress: string;
}

export const ClientData = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ISClientData => {
    const request: Request = context.switchToHttp().getRequest();

    const userAgent = request['headers']['user-agent'] ?? 'Unknown device';

    console.log({ userAgent });

    const ipAddress = request.ip ?? 'Unkown Ip';
    const { browser, device, os } = UAParser(userAgent);

    const browserString = browser.name
      ? `${browser.name} ${browser.version ?? ''}`.trim()
      : 'Unknown Browser';
    const osString = os.name
      ? `${os.name} ${os.version ?? ''}`.trim()
      : 'Unknown OS';
    const deviceString = device.vendor
      ? `${device.vendor} ${device.model ?? ''}`.trim()
      : (device.type ?? 'Desktop');

    const deviceInfo = `${browserString} on ${osString} (${deviceString})`;

    console.log({ deviceInfo });
    return {
      deviceInfo,
      ipAddress,
    };
  },
);
