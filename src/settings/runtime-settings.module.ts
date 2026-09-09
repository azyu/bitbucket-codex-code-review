import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RuntimeSettingEntity } from "../entities/runtime-setting.entity";
import { DashboardAuthGuard } from "../internal/dashboard-auth.guard";
import { RuntimeSettingsService } from "./runtime-settings.service";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RuntimeSettingEntity])],
  providers: [RuntimeSettingsService, DashboardAuthGuard],
  exports: [RuntimeSettingsService, DashboardAuthGuard],
})
export class RuntimeSettingsModule {}
