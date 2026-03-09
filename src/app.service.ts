import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  getHealth(): string {
    return "Code Review Service is healthy";
  }
}
