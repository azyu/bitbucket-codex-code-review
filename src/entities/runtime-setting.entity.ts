import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { SCHEMA_NAME_CODE_REVIEW } from "@lib/index";

export type RuntimeSettingScope = "global" | "repository";

@Entity("runtime_settings", { database: SCHEMA_NAME_CODE_REVIEW })
@Index(["scope", "workspaceSlug", "repositorySlug"], { unique: true })
export class RuntimeSettingEntity {
  @PrimaryColumn({ type: "varchar", length: 600 })
  scopeKey: string;

  @Column({ type: "enum", enum: ["global", "repository"] })
  scope: RuntimeSettingScope;

  @Column({ type: "varchar", length: 255, default: "" })
  workspaceSlug: string;

  @Column({ type: "varchar", length: 255, default: "" })
  repositorySlug: string;

  @Column({ type: "json" })
  values: Record<string, string | number>;
  @Column({ type: "text" })
  encryptedSecrets: string;

  @Column({ type: "int", default: 1 })
  revision: number;

  @UpdateDateColumn({ type: "timestamp", precision: 6 })
  updatedAt: Date;
}
