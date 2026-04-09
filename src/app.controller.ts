import { Controller, Get, Header } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  getHealth(): string {
    return this.appService.getHealth();
  }

  @Get("dashboard")
  @Header("Content-Type", "text/html; charset=utf-8")
  getDashboard(): string {
    return this.appService.getDashboardPage();
  }

  @Get("dashboard.js")
  @Header("Content-Type", "application/javascript; charset=utf-8")
  getDashboardScript(): string {
    return this.appService.getDashboardScript();
  }

  @Get("dashboard-alpine.js")
  @Header("Content-Type", "application/javascript; charset=utf-8")
  getDashboardAlpineScript(): string {
    return this.appService.getDashboardAlpineScript();
  }
}
